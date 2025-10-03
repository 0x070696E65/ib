// frontend/src/components/pnl-tabs/BasicAnalysisTab.tsx
import React, { useMemo, useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  type DotProps
} from 'recharts'
import { type BasicPnLData, type PeriodPnLSummary, type TradeDetail, type TradeDetailsResult, fetchTradeDetails } from '../../api/pnlService'

interface ChartDataPoint extends BasicPnLData {
  isFilledDate?: boolean // ゼロ埋めされた日かどうか
}

interface CustomTooltipProps {
  active?: boolean
  payload?: { payload: ChartDataPoint }[]
  label?: string
}

interface BasicAnalysisTabProps {
  summary: PeriodPnLSummary
  dailyData: BasicPnLData[]
  fillZeroDates: boolean
  startDate?: string
  endDate?: string
  symbol: string
  tag?: string
  loading?: boolean
  onRefresh?: () => void
}

const BasicAnalysisTab: React.FC<BasicAnalysisTabProps> = ({
  summary,
  dailyData,
  fillZeroDates,
  startDate,
  endDate,
  symbol,
  tag,
  loading = false,
  onRefresh
}) => {
  // 取引詳細の状態管理
  const [tradeDetails, setTradeDetails] = useState<TradeDetailsResult | null>(null)
  const [tradesLoading, setTradesLoading] = useState(false)
  const [tradesError, setTradesError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortBy, setSortBy] = useState('tradeDate')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // --- Bundle grouping logic ---
const { bundledTrades, unbundledTrades } = useMemo(() => {
  if (!tradeDetails?.trades) return { bundledTrades: new Map(), unbundledTrades: [] }

  const bundleMap = new Map<string, TradeDetail[]>()
  const unbundled: TradeDetail[] = []

  tradeDetails.trades.forEach(trade => {
    if (trade.bundleId) {
      if (!bundleMap.has(trade.bundleId)) {
        bundleMap.set(trade.bundleId, [])
      }
      bundleMap.get(trade.bundleId)!.push(trade)
    } else {
      unbundled.push(trade)
    }
  })

  return { bundledTrades: bundleMap, unbundledTrades: unbundled }
}, [tradeDetails])

// --- Calculate bundle P&L ---
const calculateBundlePnL = (bundleTrades: TradeDetail[]) => {
  return bundleTrades.reduce((sum, trade) => sum + trade.totalRealizedPnL, 0)
}

  // 取引詳細データ取得
  const fetchTradesData = async (page = 1) => {
    setTradesLoading(true)
    setTradesError(null)
    try {
      const result = await fetchTradeDetails(
        startDate,
        endDate,
        symbol,
        tag,
        page,
        50,
        sortBy,
        sortOrder
      )
      setTradeDetails(result)
      setCurrentPage(page)
    } catch (err) {
      setTradesError(err instanceof Error ? err.message : '取引詳細の取得に失敗しました')
      console.error('取引詳細取得エラー:', err)
    } finally {
      setTradesLoading(false)
    }
  }

  // 初回データ取得とフィルタ変更時の再取得
  useEffect(() => {
    fetchTradesData(1)
  }, [startDate, endDate, symbol, tag, sortBy, sortOrder])

  // ソート変更ハンドラ
  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  // ページ変更ハンドラ
  const handlePageChange = (page: number) => {
    fetchTradesData(page)
  }

  // 日付ゼロ埋め処理（フロントエンド側）
  const processedChartData = useMemo((): ChartDataPoint[] => {
    if (!dailyData.length) return []

    const originalData = dailyData
    
    // ゼロ埋めしない場合はそのまま返す
    if (!fillZeroDates) {
      return originalData.map(d => ({ ...d, isFilledDate: false }))
    }

    // ゼロ埋め処理
    const filledData: ChartDataPoint[] = []
    const dataMap = new Map(originalData.map(d => [d.date, d]))

    const startDateObj = new Date(originalData[0].date)
    const endDateObj = new Date(originalData[originalData.length - 1].date)
    const currentDate = new Date(startDateObj)
    let cumulativePnL = 0

    while (currentDate <= endDateObj) {
      const dateKey = currentDate.toISOString().split('T')[0]
      const existingData = dataMap.get(dateKey)

      if (existingData) {
        cumulativePnL = existingData.cumulativePnL
        filledData.push({
          ...existingData,
          isFilledDate: false,
        })
      } else {
        // 取引のない日（ゼロ埋め）
        filledData.push({
          date: dateKey,
          dailyPnL: 0,
          cumulativePnL,
          tradeCount: 0,
          isFilledDate: true, // ゼロ埋めフラグ
        })
      }

      currentDate.setDate(currentDate.getDate() + 1)
    }

    return filledData
  }, [dailyData, fillZeroDates])

  // カスタムツールチップ（ゼロ埋め日は表示しない）
  const CustomTooltip: React.FC<CustomTooltipProps> = ({
    active,
    payload,
    label,
  }) => {
    if (!active || !payload || !payload.length) return null

    const data = payload[0].payload as ChartDataPoint
    
    // ゼロ埋めされた日はツールチップを表示しない
    if (data.isFilledDate) return null

    return (
      <div className="bg-black/80 p-3 border border-white/20 rounded-lg shadow-lg">
        <p className="font-medium text-white">{`Date: ${new Date(label!).toLocaleDateString()}`}</p>
        <p className="text-blue-400">{`Daily P&L: ${formatCurrency(data.dailyPnL)}`}</p>
        <p className="text-green-400">{`Cumulative P&L: ${formatCurrency(data.cumulativePnL)}`}</p>
        <p className="text-gray-300">{`Trades: ${data.tradeCount}`}</p>
      </div>
    )
  }

  // チャートのドット表示制御（ゼロ埋め日は非表示）
  const CustomDot = (props: DotProps) => {
    const p = props as DotProps & { payload?: unknown }
    const { cx, cy, r, payload } = p

    if (payload && typeof payload === 'object' && 'isFilledDate' in payload && payload.isFilledDate) {
      return null
    }

    return <circle cx={cx} cy={cy} r={r} fill="#10B981" stroke="#10B981" strokeWidth={2} />
  }

  const getBarColor = (entry: ChartDataPoint) => {
    if (entry.dailyPnL > 0) return '#10B981' // 緑
    if (entry.dailyPnL < 0) return '#EF4444' // 赤
    return '#6B7280' // グレー（ゼロ）
  }

  // bundleIdの色生成（同じbundleIdは同じ色）
  const getBundleColor = (bundleId: string) => {
    const colors = ['#8B5CF6', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#F97316']
    const hash = bundleId.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0)
      return a & a
    }, 0)
    return colors[Math.abs(hash) % colors.length]
  }

  // 取引詳細テーブル行コンポーネント
  const TradeRow: React.FC<{ trade: TradeDetail; index?: number }> = ({ trade }) => {
    const bundleColor = trade.bundleId ? getBundleColor(trade.bundleId) : undefined

    return (
      <tr 
        className={`border-b border-white/5 hover:bg-white/5 transition-colors duration-200 ${
          trade.bundleId ? 'border-l-4' : ''
        }`}
        style={trade.bundleId ? { borderLeftColor: bundleColor } : {}}
      >
        <td className="py-3 px-4 text-sm text-gray-300">
          {new Date(trade.tradeDate).toLocaleDateString()}
        </td>
        <td className="py-3 px-4 text-sm text-white font-mono">
          {trade.orderID}
        </td>
        <td className="py-3 px-4 text-sm text-gray-300 max-w-xs">
          <div className="truncate" title={trade.description}>
            {trade.description}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {trade.expiry && `${trade.expiry} ${trade.strike}${trade.putCall}`}
          </div>
        </td>
        <td className="py-3 px-4 text-sm">
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            trade.buySell === 'BUY' 
              ? 'bg-blue-500/20 text-blue-400' 
              : 'bg-red-500/20 text-red-400'
          }`}>
            {trade.buySell}
          </span>
        </td>
        <td className="py-3 px-4 text-sm text-white font-mono text-right">
          {trade.totalQuantity.toLocaleString()}
        </td>
        <td className="py-3 px-4 text-sm text-white font-mono text-right">
          ${trade.avgPrice.toFixed(2)}
        </td>
        <td className={`py-3 px-4 text-sm font-mono text-right font-medium ${
          trade.totalRealizedPnL >= 0 ? 'text-green-400' : 'text-red-400'
        }`}>
          {formatCurrency(trade.totalRealizedPnL)}
        </td>
        <td className="py-3 px-4 text-sm">
          {trade.tag && (
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              trade.tag === 'PP' ? 'bg-purple-500/20 text-purple-400' :
              trade.tag === 'P+' ? 'bg-green-500/20 text-green-400' :
              'bg-orange-500/20 text-orange-400'
            }`}>
              {trade.tag}
            </span>
          )}
        </td>
        <td className="py-3 px-4 text-sm">
          {trade.bundleId && (
            <div className="flex items-center space-x-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: bundleColor }}
              ></div>
              <span className="text-xs text-gray-400 font-mono">
                {trade.bundleId.substring(0, 8)}...
              </span>
            </div>
          )}
        </td>
      </tr>
    )
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  const formatCurrency = (value: number) => {
    return `$${value.toFixed(2)}`
  }

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`
  }

  // No Data State
  if (!loading && processedChartData.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4">📊</div>
        <h3 className="text-xl text-white/70 mb-2">No trading data found</h3>
        <p className="text-gray-400 mb-6">
          No P&L data available for the selected filters. 
          Try adjusting your date range.
        </p>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-medium transition-all duration-200"
          >
            Reload Data
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* サマリー情報 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
          <div className="text-sm text-gray-400 mb-2">Total P&L</div>
          <div className={`text-2xl font-bold ${summary.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatCurrency(summary.totalPnL)}
          </div>
        </div>
        <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
          <div className="text-sm text-gray-400 mb-2">Win Rate</div>
          <div className="text-2xl font-bold text-white">
            {formatPercent(summary.winRate)}
          </div>
          <div className="text-xs text-gray-500">
            {summary.winCount}W / {summary.lossCount}L
          </div>
        </div>
        <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
          <div className="text-sm text-gray-400 mb-2">Total Trades</div>
          <div className="text-2xl font-bold text-white">
            {summary.tradeCount.toLocaleString()}
          </div>
        </div>
        <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
          <div className="text-sm text-gray-400 mb-2">Profit Factor</div>
          <div className="text-2xl font-bold text-white">
            {summary.profitFactor.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500">
            Avg Win: {formatCurrency(summary.avgWin)}
          </div>
        </div>
      </div>

      {/* 累積損益チャート */}
      {processedChartData.length > 0 && (
        <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Cumulative P&L</h2>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={processedChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="date" 
                  stroke="#9CA3AF"
                  fontSize={12}
                  tickFormatter={formatDate}
                />
                <YAxis 
                  stroke="#9CA3AF"
                  fontSize={12}
                  tickFormatter={formatCurrency}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line 
                  type="monotone" 
                  dataKey="cumulativePnL" 
                  stroke="#10B981" 
                  strokeWidth={2}
                  dot={<CustomDot />}
                  connectNulls={true}
                  activeDot={{ r: 5, fill: '#10B981' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 日次損益バーチャート */}
      {processedChartData.length > 0 && (
        <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Daily P&L</h2>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={processedChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="date"
                  stroke="#9CA3AF"
                  fontSize={12}
                  tickFormatter={formatDate}
                />
                <YAxis 
                  stroke="#9CA3AF"
                  fontSize={12}
                  tickFormatter={formatCurrency}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="dailyPnL" radius={[2, 2, 0, 0]}>
                  {processedChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getBarColor(entry)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 取引詳細テーブル */}
      <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Trade Details</h2>
          {tradeDetails && (
            <div className="text-sm text-gray-400">
              Showing {((tradeDetails.currentPage - 1) * 50) + 1}-{Math.min(tradeDetails.currentPage * 50, tradeDetails.totalCount)} of {tradeDetails.totalCount} trades
            </div>
          )}
        </div>

        {tradesLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-2"></div>
            <p className="text-gray-400">Loading trade details...</p>
          </div>
        ) : tradesError ? (
          <div className="text-center py-8">
            <div className="text-red-400 mb-2">{tradesError}</div>
            <button
              onClick={() => fetchTradesData(currentPage)}
              className="text-purple-400 hover:text-purple-300 text-sm underline"
            >
              Retry
            </button>
          </div>
        ) : tradeDetails && tradeDetails.trades.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th 
                      className="text-left py-3 px-4 text-gray-300 cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('tradeDate')}
                    >
                      Date
                      {sortBy === 'tradeDate' && (
                        <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th className="text-left py-3 px-4 text-gray-300">Order ID</th>
                    <th className="text-left py-3 px-4 text-gray-300">Description</th>
                    <th className="text-left py-3 px-4 text-gray-300">Side</th>
                    <th className="text-right py-3 px-4 text-gray-300">Quantity</th>
                    <th className="text-right py-3 px-4 text-gray-300">Avg Price</th>
                    <th 
                      className="text-right py-3 px-4 text-gray-300 cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('totalRealizedPnL')}
                    >
                      P&L
                      {sortBy === 'totalRealizedPnL' && (
                        <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                    <th className="text-left py-3 px-4 text-gray-300">Tag</th>
                    <th className="text-left py-3 px-4 text-gray-300">Bundle</th>
                  </tr>
                </thead>
                <tbody>
                {/* Bundled Trades */}
                {Array.from(bundledTrades.entries()).map(([bundleId, bundleTrades]) => {
                  const bundleColor = getBundleColor(bundleId)
                  const bundlePnL = calculateBundlePnL(bundleTrades)
                  
                  return (
                    <React.Fragment key={bundleId}>
                      {/* Bundle Header */}
                      <tr>
                        <td colSpan={9} className="py-3 px-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <div 
                                className="w-4 h-4 rounded-full"
                                style={{ backgroundColor: bundleColor }}
                              ></div>
                              <span className="text-purple-300 font-medium text-sm">
                                Bundle: {bundleTrades.length} trades
                              </span>
                              <span className="text-xs text-gray-400 font-mono">
                                {bundleId.substring(0, 12)}...
                              </span>
                            </div>
                            <div className="flex items-center space-x-4">
                              <span className="text-gray-300 text-sm">Total P&L:</span>
                              <span className="font-mono text-sm font-semibold">
                                {bundlePnL >= 0 
                                  ? <span className="text-green-400">+${bundlePnL.toFixed(2)}</span> 
                                  : <span className="text-red-400">${bundlePnL.toFixed(2)}</span>}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                      {/* Bundle Trades */}
                      {bundleTrades.map((trade: TradeDetail) => (
                        <TradeRow 
                          key={trade._id} 
                          trade={trade} 
                        />
                      ))}
                      {/* Separator */}
                      <tr>
                        <td colSpan={9} className="py-2">
                          <div 
                            className="h-px"
                            style={{ 
                              background: `linear-gradient(90deg, transparent 0%, ${bundleColor}30 50%, transparent 100%)`
                            }}
                          ></div>
                        </td>
                      </tr>
                    </React.Fragment>
                  )
                })}

                {/* Unbundled Trades */}
                {unbundledTrades.length > 0 && bundledTrades.size > 0 && (
                  <tr>
                    <td colSpan={9} className="py-3 px-4">
                      <div className="text-gray-400 text-sm font-medium">Individual Trades</div>
                    </td>
                  </tr>
                )}
                {unbundledTrades.map((trade) => (
                  <TradeRow key={trade._id} trade={trade} />
                ))}
              </tbody>
              </table>
            </div>

            {/* ページネーション */}
            {tradeDetails.totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
                <div className="text-sm text-gray-400">
                  Page {tradeDetails.currentPage} of {tradeDetails.totalPages}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handlePageChange(tradeDetails.currentPage - 1)}
                    disabled={tradeDetails.currentPage <= 1}
                    className="px-3 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors duration-200"
                  >
                    Previous
                  </button>
                  
                  {/* ページ番号 */}
                  <div className="flex items-center space-x-1">
                    {Array.from({ length: Math.min(5, tradeDetails.totalPages) }, (_, i) => {
                      const pageNum = Math.max(1, tradeDetails.currentPage - 2) + i
                      if (pageNum > tradeDetails.totalPages) return null
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          className={`px-3 py-2 rounded-lg text-sm transition-colors duration-200 ${
                            pageNum === tradeDetails.currentPage
                              ? 'bg-purple-600 text-white'
                              : 'bg-white/10 hover:bg-white/20 text-gray-300'
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                  </div>

                  <button
                    onClick={() => handlePageChange(tradeDetails.currentPage + 1)}
                    disabled={tradeDetails.currentPage >= tradeDetails.totalPages}
                    className="px-3 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors duration-200"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">📋</div>
            <h3 className="text-xl text-white/70 mb-2">No trade details found</h3>
            <p className="text-gray-400">
              No individual trades match the current filters.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default BasicAnalysisTab