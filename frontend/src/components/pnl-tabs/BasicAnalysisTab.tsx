// frontend/src/components/pnl-tabs/BasicAnalysisTab.tsx
import React, { useMemo } from 'react'
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
import { type BasicPnLData, type PeriodPnLSummary } from '../../api/pnlService'

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
  loading?: boolean
  onRefresh?: () => void
}

const BasicAnalysisTab: React.FC<BasicAnalysisTabProps> = ({
  summary,
  dailyData,
  fillZeroDates,
  loading = false,
  onRefresh
}) => {
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
    </div>
  )
}

export default BasicAnalysisTab