// frontend/src/pages/PnLAnalysisPage.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react'
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
import { fetchBasicPnLAnalysis, type PnLAnalysisResult, type BasicPnLData } from '../api/pnlService'

interface ChartDataPoint extends BasicPnLData {
  isFilledDate?: boolean // ゼロ埋めされた日かどうか
}

interface CustomTooltipProps {
  active?: boolean
  payload?: { payload: ChartDataPoint }[]
  label?: string
}

const PnLAnalysisPage: React.FC = () => {
  const [data, setData] = useState<PnLAnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // フィルタ状態
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  
  // 一時的な日付範囲を別で管理
  const [tempStartDate, setTempStartDate] = useState('')
  const [tempEndDate, setTempEndDate] = useState('')
  
  // ゼロ埋め設定
  const [fillZeroDates, setFillZeroDates] = useState(true)

  // データ取得関数
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchBasicPnLAnalysis(
        startDate || undefined,
        endDate || undefined,
        'VIX'
      )
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '損益分析データの取得に失敗しました')
      console.error('損益分析データ取得エラー:', err)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  // 初回データ取得
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // フィルタ適用
  const handleApplyFilter = async () => {
    setStartDate(tempStartDate)
    setEndDate(tempEndDate)
    
    // 新しい日付で直接API呼び出し
    setLoading(true)
    setError(null)
    try {
      const result = await fetchBasicPnLAnalysis(
        tempStartDate || undefined,
        tempEndDate || undefined,
        'VIX'
      )
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '損益分析データの取得に失敗しました')
      console.error('損益分析データ取得エラー:', err)
    } finally {
      setLoading(false)
    }
  }

  // 日付変更の検出
  const hasDateChanges = tempStartDate !== startDate || tempEndDate !== endDate

  // 日付ゼロ埋め処理（フロントエンド側）
  const processedChartData = useMemo((): ChartDataPoint[] => {
    if (!data || !data.dailyData.length) return []

    const originalData = data.dailyData
    
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
  }, [data, fillZeroDates])

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

  if (loading) {
    return (
      <div className="w-screen min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-500 mx-auto mb-4"></div>
          <p className="text-xl text-white">Loading P&L analysis...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-screen min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 overflow-x-hidden">
      {/* 背景パターン */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}></div>
      </div>

      <div className="relative z-10 p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-green-500 to-blue-600 rounded-full mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent mb-2">
            VIX P&L Analysis
          </h1>
          <p className="text-gray-400 text-lg">Comprehensive trading performance analysis with zero-fill options</p>
        </div>

        {/* フィルタコントロール */}
        <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">Filters & Settings</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Start Date</label>
              <input
                type="date"
                value={tempStartDate}
                onChange={(e) => setTempStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">End Date</label>
              <input
                type="date"
                value={tempEndDate}
                onChange={(e) => setTempEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleApplyFilter}
                disabled={!hasDateChanges}
                className="w-full px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all duration-200"
              >
                Apply Filter
              </button>
            </div>
          </div>

          {/* ゼロ埋め設定 */}
          <div className="pt-4 border-t border-white/10">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={fillZeroDates}
                onChange={(e) => setFillZeroDates(e.target.checked)}
                className="w-4 h-4 text-purple-600 bg-gray-800 border-gray-600 rounded focus:ring-purple-500 focus:ring-2"
              />
              <div>
                <span className="text-sm font-medium text-white">
                  Fill zero dates (show continuous timeline)
                </span>
                <p className="text-xs text-gray-400 mt-1">
                  When unchecked, only shows dates with actual trades
                </p>
              </div>
            </label>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 mb-6">
            <div className="text-red-300">{error}</div>
            <button 
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-300 text-sm underline mt-1"
            >
              Close
            </button>
          </div>
        )}

        {/* サマリー情報 */}
        {data && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
              <div className="text-sm text-gray-400 mb-2">Total P&L</div>
              <div className={`text-2xl font-bold ${data.summary.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(data.summary.totalPnL)}
              </div>
            </div>
            <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
              <div className="text-sm text-gray-400 mb-2">Win Rate</div>
              <div className="text-2xl font-bold text-white">
                {formatPercent(data.summary.winRate)}
              </div>
              <div className="text-xs text-gray-500">
                {data.summary.winCount}W / {data.summary.lossCount}L
              </div>
            </div>
            <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
              <div className="text-sm text-gray-400 mb-2">Total Trades</div>
              <div className="text-2xl font-bold text-white">
                {data.summary.tradeCount.toLocaleString()}
              </div>
            </div>
            <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
              <div className="text-sm text-gray-400 mb-2">Profit Factor</div>
              <div className="text-2xl font-bold text-white">
                {data.summary.profitFactor.toFixed(2)}
              </div>
              <div className="text-xs text-gray-500">
                Avg Win: {formatCurrency(data.summary.avgWin)}
              </div>
            </div>
          </div>
        )}

        {/* 累積損益チャート */}
        {processedChartData.length > 0 && (
          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6 mb-6">
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
          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6 mb-6">
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

        {/* No Data State */}
        {!loading && (!data || processedChartData.length === 0) && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-xl text-white/70 mb-2">No trading data found</h3>
            <p className="text-gray-400 mb-6">
              No P&L data available for the selected filters. 
              Try adjusting your date range.
            </p>
            <button
              onClick={fetchData}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-medium transition-all duration-200"
            >
              Reload Data
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default PnLAnalysisPage