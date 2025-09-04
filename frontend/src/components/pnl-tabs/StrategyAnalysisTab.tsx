// frontend/src/components/pnl-tabs/StrategyAnalysisTab.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Line
} from 'recharts'
import { fetchTagAnalysis } from '../../api/pnlService'

interface TagAnalysisData {
  tag: string
  totalPnL: number
  tradeCount: number
  winRate: number
  avgPnL: number
}

interface StrategyMetrics {
  tag: string
  totalPnL: number
  tradeCount: number
  winRate: number
  avgPnL: number
  profitFactor: number
  maxDrawdown: number
  sharpeRatio: number
  roi: number
}

interface StrategyAnalysisTabProps {
  startDate?: string
  endDate?: string
  symbol: string
  loading?: boolean
  onRefresh?: () => void
}

// デバッグ用モックデータ
const MOCK_DATA: TagAnalysisData[] = [
  {
    tag: 'PP',
    totalPnL: 12450.50,
    tradeCount: 25,
    winRate: 0.68,
    avgPnL: 498.02
  },
  {
    tag: 'P-',
    totalPnL: -3220.75,
    tradeCount: 18,
    winRate: 0.44,
    avgPnL: -178.93
  },
  {
    tag: 'P+',
    totalPnL: 8750.25,
    tradeCount: 32,
    winRate: 0.75,
    avgPnL: 273.44
  },
  {
    tag: 'CC',
    totalPnL: 2100.00,
    tradeCount: 12,
    winRate: 0.58,
    avgPnL: 175.00
  },
  {
    tag: 'HEDGE',
    totalPnL: -1200.50,
    tradeCount: 8,
    winRate: 0.25,
    avgPnL: -150.06
  }
]

const USE_MOCK_DATA = true // 実データが利用可能になったらfalseに変更

const StrategyAnalysisTab: React.FC<StrategyAnalysisTabProps> = ({
  startDate,
  endDate,
  symbol,
  loading: externalLoading = false,
  onRefresh
}) => {
  const [data, setData] = useState<TagAnalysisData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // データ取得
  const fetchData = useCallback(async () => {
    if (USE_MOCK_DATA) {
      // デバッグ用モックデータを使用
      setData(MOCK_DATA)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await fetchTagAnalysis(startDate, endDate, symbol)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'タグ分析データの取得に失敗しました')
      console.error('タグ分析データ取得エラー:', err)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, symbol])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 拡張メトリクス計算
  const strategiesWithMetrics = useMemo((): StrategyMetrics[] => {
    return data.map(item => {
      const winCount = Math.round(item.tradeCount * item.winRate)
      const lossCount = item.tradeCount - winCount
      const avgWin = item.avgPnL > 0 ? item.avgPnL / item.winRate : 0
      const avgLoss = item.avgPnL < 0 ? Math.abs(item.avgPnL) / (1 - item.winRate) : 0
      
      return {
        ...item,
        profitFactor: avgLoss > 0 ? (avgWin * winCount) / (avgLoss * lossCount) : item.totalPnL > 0 ? 999 : 0,
        maxDrawdown: Math.max(0, -item.totalPnL * 0.3), // 仮想的な最大ドローダウン
        sharpeRatio: item.avgPnL / Math.max(1, Math.abs(item.avgPnL) * 0.5), // 簡易シャープレシオ
        roi: item.avgPnL / Math.max(100, Math.abs(item.totalPnL) * 0.1) // 簡易ROI
      }
    })
  }, [data])

  // パフォーマンスサマリー
  const summary = useMemo(() => {
    if (!data.length) return null

    const totalPnL = data.reduce((sum, item) => sum + item.totalPnL, 0)
    const totalTrades = data.reduce((sum, item) => sum + item.tradeCount, 0)
    const profitableStrategies = data.filter(item => item.totalPnL > 0).length
    const bestStrategy = data.reduce((best, current) => 
      current.totalPnL > best.totalPnL ? current : best
    )
    const worstStrategy = data.reduce((worst, current) => 
      current.totalPnL < worst.totalPnL ? current : worst
    )
    const avgWinRate = data.reduce((sum, item) => sum + item.winRate, 0) / data.length

    return {
      totalPnL,
      totalTrades,
      totalStrategies: data.length,
      profitableStrategies,
      profitableRate: profitableStrategies / data.length,
      bestStrategy,
      worstStrategy,
      avgWinRate
    }
  }, [data])

  // 色設定
  const COLORS = ['#10B981', '#F59E0B', '#3B82F6', '#EF4444', '#8B5CF6', '#F97316']

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`
  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`

  const getBarColor = (value: number, index: number) => {
    if (value > 0) return COLORS[index % COLORS.length]
    return '#EF4444'
  }

  interface CustomTooltipProps {
    active?: boolean
    payload?: { payload: TagAnalysisData | StrategyMetrics }[]
    label?: string
  }

  const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null

    const data = payload[0].payload
    return (
      <div className="bg-black/80 p-3 border border-white/20 rounded-lg shadow-lg">
        <p className="font-medium text-white">{`Strategy: ${label}`}</p>
        <p className="text-blue-400">{`Total P&L: ${formatCurrency(data.totalPnL)}`}</p>
        <p className="text-green-400">{`Win Rate: ${formatPercent(data.winRate)}`}</p>
        <p className="text-gray-300">{`Trades: ${data.tradeCount}`}</p>
        <p className="text-yellow-400">{`Avg P&L: ${formatCurrency(data.avgPnL)}`}</p>
      </div>
    )
  }

  if (loading || externalLoading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-500 mx-auto mb-4"></div>
        <p className="text-xl text-white">Loading strategy analysis...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4">❌</div>
        <h3 className="text-xl text-white/70 mb-2">Error loading data</h3>
        <p className="text-gray-400 mb-6">{error}</p>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-medium transition-all duration-200"
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  if (!data.length) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4">🎯</div>
        <h3 className="text-xl text-white/70 mb-2">No strategy data found</h3>
        <p className="text-gray-400 mb-6">
          {USE_MOCK_DATA 
            ? "Mock data is enabled. Switch USE_MOCK_DATA to false to use real data."
            : "No tag-based strategy data available for the selected filters."
          }
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
      {/* デバッグ情報 */}
      {USE_MOCK_DATA && (
        <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <p className="text-yellow-300 font-medium">Using Mock Data</p>
              <p className="text-yellow-200 text-sm">Switch USE_MOCK_DATA to false when real tag data becomes available</p>
            </div>
          </div>
        </div>
      )}

      {/* 戦略サマリー */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
            <div className="text-sm text-gray-400 mb-2">Total Strategy P&L</div>
            <div className={`text-2xl font-bold ${summary.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatCurrency(summary.totalPnL)}
            </div>
            <div className="text-xs text-gray-500">
              {summary.totalStrategies} strategies
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
            <div className="text-sm text-gray-400 mb-2">Profitable Strategies</div>
            <div className="text-2xl font-bold text-white">
              {formatPercent(summary.profitableRate)}
            </div>
            <div className="text-xs text-gray-500">
              {summary.profitableStrategies} / {summary.totalStrategies}
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
            <div className="text-sm text-gray-400 mb-2">Best Strategy</div>
            <div className="text-xl font-bold text-green-400">
              {summary.bestStrategy.tag}
            </div>
            <div className="text-xs text-gray-500">
              {formatCurrency(summary.bestStrategy.totalPnL)}
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
            <div className="text-sm text-gray-400 mb-2">Worst Strategy</div>
            <div className="text-xl font-bold text-red-400">
              {summary.worstStrategy.tag}
            </div>
            <div className="text-xs text-gray-500">
              {formatCurrency(summary.worstStrategy.totalPnL)}
            </div>
          </div>
        </div>
      )}

      {/* 戦略別パフォーマンス比較 */}
      <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Strategy Performance Comparison</h2>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="tag"
                stroke="#9CA3AF"
                fontSize={12}
              />
              <YAxis 
                stroke="#9CA3AF"
                fontSize={12}
                tickFormatter={formatCurrency}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="totalPnL" radius={[2, 2, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry.totalPnL, index)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 戦略配分 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Trade Count Distribution</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ tag, tradeCount }) => `${tag}: ${tradeCount}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="tradeCount"
                >
                  {data.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value} trades`, 'Trade Count']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Win Rate vs Avg P&L</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="tag" stroke="#9CA3AF" fontSize={12} />
                <YAxis stroke="#9CA3AF" fontSize={12} tickFormatter={formatPercent} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="winRate" fill="#10B981" />
                <Line
                  type="monotone"
                  dataKey="avgPnL"
                  stroke="#F59E0B"
                  strokeWidth={3}
                  dot={{ r: 5, fill: '#F59E0B' }}
                  yAxisId="right"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 戦略詳細テーブル */}
      <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Strategy Details</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-3 px-4 text-gray-300">Strategy</th>
                <th className="text-right py-3 px-4 text-gray-300">Total P&L</th>
                <th className="text-right py-3 px-4 text-gray-300">Trades</th>
                <th className="text-right py-3 px-4 text-gray-300">Win Rate</th>
                <th className="text-right py-3 px-4 text-gray-300">Avg P&L</th>
                <th className="text-right py-3 px-4 text-gray-300">Profit Factor</th>
              </tr>
            </thead>
            <tbody>
              {strategiesWithMetrics.map((strategy, index) => (
                <tr key={strategy.tag} className="border-b border-white/5">
                  <td className="py-3 px-4">
                    <div className="flex items-center space-x-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      ></div>
                      <span className="text-white font-medium">{strategy.tag}</span>
                    </div>
                  </td>
                  <td className={`text-right py-3 px-4 font-mono ${strategy.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(strategy.totalPnL)}
                  </td>
                  <td className="text-right py-3 px-4 text-gray-300">{strategy.tradeCount}</td>
                  <td className="text-right py-3 px-4 text-gray-300">{formatPercent(strategy.winRate)}</td>
                  <td className={`text-right py-3 px-4 font-mono ${strategy.avgPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(strategy.avgPnL)}
                  </td>
                  <td className="text-right py-3 px-4 text-gray-300">
                    {strategy.profitFactor === 999 ? '∞' : strategy.profitFactor.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default StrategyAnalysisTab