// frontend/src/components/pnl-tabs/MonthlyAnalysisTab.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  Cell,
  ComposedChart,
  Area,
  AreaChart
} from 'recharts'
import { fetchMonthlyPnLAnalysis } from '../../api/pnlService'

interface MonthlyPnLData {
  month: string      // "2024-09"
  totalPnL: number
  tradeCount: number
  winRate: number
}

interface SeasonalityData {
  month: string      // "Jan", "Feb", etc.
  avgPnL: number
  totalPnL: number
  tradeCount: number
  winRate: number
  yearCount: number  // データがある年数
}

interface YearlyData {
  year: string
  totalPnL: number
  tradeCount: number
  winRate: number
  monthlyData: { [month: string]: number } // ヒートマップ用
}

interface MonthlyAnalysisTabProps {
  startDate?: string
  endDate?: string
  symbol: string
  loading?: boolean
  onRefresh?: () => void
}

const MonthlyAnalysisTab: React.FC<MonthlyAnalysisTabProps> = ({
  startDate,
  endDate,
  symbol,
  loading: externalLoading = false,
  onRefresh
}) => {
  const [data, setData] = useState<MonthlyPnLData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // データ取得
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchMonthlyPnLAnalysis(startDate, endDate, symbol)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '月次分析データの取得に失敗しました')
      console.error('月次分析データ取得エラー:', err)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, symbol])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // 季節性分析データ（月別平均）
  const seasonalityData = useMemo((): SeasonalityData[] => {
    if (!data.length) return []

    const monthMap = new Map<string, { totalPnL: number; tradeCount: number; winRate: number; count: number }>()

    data.forEach(item => {
      const monthName = new Date(item.month + '-01').toLocaleString('en', { month: 'short' })
      const existing = monthMap.get(monthName) || { totalPnL: 0, tradeCount: 0, winRate: 0, count: 0 }
      
      monthMap.set(monthName, {
        totalPnL: existing.totalPnL + item.totalPnL,
        tradeCount: existing.tradeCount + item.tradeCount,
        winRate: existing.winRate + item.winRate,
        count: existing.count + 1
      })
    })

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    
    return months.map(month => {
      const monthData = monthMap.get(month) || { totalPnL: 0, tradeCount: 0, winRate: 0, count: 0 }
      return {
        month,
        avgPnL: monthData.count > 0 ? monthData.totalPnL / monthData.count : 0,
        totalPnL: monthData.totalPnL,
        tradeCount: monthData.tradeCount,
        winRate: monthData.count > 0 ? monthData.winRate / monthData.count : 0,
        yearCount: monthData.count
      }
    })
  }, [data])

  // 年別サマリーデータ
  const yearlyData = useMemo((): YearlyData[] => {
    if (!data.length) return []

    const yearMap = new Map<string, { totalPnL: number; tradeCount: number; winRate: number; count: number; monthlyData: { [month: string]: number } }>()

    data.forEach(item => {
      const year = item.month.split('-')[0]
      const monthNum = parseInt(item.month.split('-')[1])
      const monthName = new Date(2000, monthNum - 1).toLocaleString('en', { month: 'short' })
      
      const existing = yearMap.get(year) || { 
        totalPnL: 0, 
        tradeCount: 0, 
        winRate: 0, 
        count: 0, 
        monthlyData: {} 
      }
      
      existing.monthlyData[monthName] = item.totalPnL
      
      yearMap.set(year, {
        totalPnL: existing.totalPnL + item.totalPnL,
        tradeCount: existing.tradeCount + item.tradeCount,
        winRate: existing.winRate + item.winRate,
        count: existing.count + 1,
        monthlyData: existing.monthlyData
      })
    })

    return Array.from(yearMap.entries())
      .map(([year, yearData]) => ({
        year,
        totalPnL: yearData.totalPnL,
        tradeCount: yearData.tradeCount,
        winRate: yearData.count > 0 ? yearData.winRate / yearData.count : 0,
        monthlyData: yearData.monthlyData
      }))
      .sort((a, b) => parseInt(b.year) - parseInt(a.year))
  }, [data])

  // サマリー統計
  const summary = useMemo(() => {
    if (!data.length) return null

    const totalPnL = data.reduce((sum, item) => sum + item.totalPnL, 0)
    const totalTrades = data.reduce((sum, item) => sum + item.tradeCount, 0)
    const avgWinRate = data.reduce((sum, item) => sum + item.winRate, 0) / data.length

    const profitableMonths = data.filter(item => item.totalPnL > 0).length
    const profitableRate = profitableMonths / data.length

    const bestMonth = data.reduce((best, current) => 
      current.totalPnL > best.totalPnL ? current : best
    )
    const worstMonth = data.reduce((worst, current) => 
      current.totalPnL < worst.totalPnL ? current : worst
    )

    return {
      totalPnL,
      totalTrades,
      avgWinRate,
      profitableMonths,
      profitableRate,
      totalMonths: data.length,
      bestMonth,
      worstMonth
    }
  }, [data])

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`
  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`
  const formatDate = (dateStr: string) => {
    const [year, month] = dateStr.split('-')
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short'
    })
  }

  const getBarColor = (value: number) => {
    if (value > 0) return '#10B981'
    if (value < 0) return '#EF4444'
    return '#6B7280'
  }

  interface CustomTooltipProps {
  active?: boolean
  payload?: { payload: MonthlyPnLData | SeasonalityData }[]
  label?: string
}

  const CustomTooltip: React.FC<CustomTooltipProps> = ({
    active,
    payload,
    label,
  }) => {
    if (!active || !payload || !payload.length) return null

    const data = payload[0].payload
    
    // 型ガードでデータ型を判定
    const isSeasonalityData = (item: MonthlyPnLData | SeasonalityData): item is SeasonalityData => {
      return 'avgPnL' in item
    }

    const pnlValue = isSeasonalityData(data) ? data.avgPnL : data.totalPnL

    return (
      <div className="bg-black/80 p-3 border border-white/20 rounded-lg shadow-lg">
        <p className="font-medium text-white">{`Month: ${label}`}</p>
        <p className="text-blue-400">{`P&L: ${formatCurrency(pnlValue)}`}</p>
        <p className="text-green-400">{`Win Rate: ${formatPercent(data.winRate)}`}</p>
        <p className="text-gray-300">{`Trades: ${data.tradeCount}`}</p>
        {isSeasonalityData(data) && data.yearCount && (
          <p className="text-gray-400 text-sm">{`Years: ${data.yearCount}`}</p>
        )}
      </div>
    )
  }

  if (loading || externalLoading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-500 mx-auto mb-4"></div>
        <p className="text-xl text-white">Loading monthly analysis...</p>
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
        <div className="text-6xl mb-4">📅</div>
        <h3 className="text-xl text-white/70 mb-2">No monthly data found</h3>
        <p className="text-gray-400 mb-6">
          No monthly P&L data available for the selected filters.
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
      {/* 月次サマリー */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
            <div className="text-sm text-gray-400 mb-2">Total Monthly P&L</div>
            <div className={`text-2xl font-bold ${summary.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatCurrency(summary.totalPnL)}
            </div>
            <div className="text-xs text-gray-500">
              {summary.totalMonths} months
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
            <div className="text-sm text-gray-400 mb-2">Profitable Months</div>
            <div className="text-2xl font-bold text-white">
              {formatPercent(summary.profitableRate)}
            </div>
            <div className="text-xs text-gray-500">
              {summary.profitableMonths} / {summary.totalMonths}
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
            <div className="text-sm text-gray-400 mb-2">Best Month</div>
            <div className="text-xl font-bold text-green-400">
              {formatCurrency(summary.bestMonth.totalPnL)}
            </div>
            <div className="text-xs text-gray-500">
              {formatDate(summary.bestMonth.month)}
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
            <div className="text-sm text-gray-400 mb-2">Worst Month</div>
            <div className="text-xl font-bold text-red-400">
              {formatCurrency(summary.worstMonth.totalPnL)}
            </div>
            <div className="text-xs text-gray-500">
              {formatDate(summary.worstMonth.month)}
            </div>
          </div>
        </div>
      )}

      {/* 月次損益チャート */}
      <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Monthly P&L Trend</h2>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="month"
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
              <Bar dataKey="totalPnL" radius={[2, 2, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry.totalPnL)} />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="winRate"
                stroke="#F59E0B"
                strokeWidth={2}
                yAxisId="right"
                dot={{ r: 3, fill: '#F59E0B' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 季節性分析 */}
      <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Seasonality Analysis</h2>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={seasonalityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="month"
                stroke="#9CA3AF"
                fontSize={12}
              />
              <YAxis 
                stroke="#9CA3AF"
                fontSize={12}
                tickFormatter={formatCurrency}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="avgPnL"
                stroke="#8B5CF6"
                fill="#8B5CF6"
                fillOpacity={0.3}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="text-sm text-gray-400 mt-2">
          Average P&L by calendar month across all years in the dataset
        </p>
      </div>

      {/* 年別パフォーマンス */}
      {yearlyData.length > 0 && (
        <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Yearly Performance</h2>
          <div className="space-y-4">
            {yearlyData.map((year) => (
              <div key={year.year} className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
                <div>
                  <div className="text-lg font-semibold text-white">{year.year}</div>
                  <div className="text-sm text-gray-400">
                    {year.tradeCount} trades • {formatPercent(year.winRate)} win rate
                  </div>
                </div>
                <div className={`text-2xl font-bold ${year.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(year.totalPnL)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default MonthlyAnalysisTab