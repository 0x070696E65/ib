// frontend/src/pages/PnLAnalysisPage.tsx
import React, { useState, useEffect, useMemo } from 'react'
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

interface ChartDataPoint {
  date: string
  dailyPnL: number
  cumulativePnL: number
  tradeCount: number
  isFilledDate?: boolean
}

interface CustomTooltipProps {
  active?: boolean
  payload?: { payload: ChartDataPoint }[]
  label?: string
}


interface ChartDataPoint extends BasicPnLData {
  isFilledDate?: boolean // ゼロ埋めされた日かどうか
}

const PnLAnalysisPage: React.FC = () => {
  const [data, setData] = useState<PnLAnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // フィルタ状態
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [symbol, setSymbol] = useState('VIX')
  
  // ゼロ埋め設定
  const [fillZeroDates, setFillZeroDates] = useState(true)

  // データ取得関数
  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchBasicPnLAnalysis(
        startDate || undefined,
        endDate || undefined,
        symbol
      )
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー')
      console.error('損益分析データ取得エラー:', err)
    } finally {
      setLoading(false)
    }
  }

  // 初回データ取得
  useEffect(() => {
    fetchData()
  }, [])

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

    const startDate = new Date(originalData[0].date)
    const endDate = new Date(originalData[originalData.length - 1].date)
    const currentDate = new Date(startDate)
    let cumulativePnL = 0

    while (currentDate <= endDate) {
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
      <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
        <p className="font-medium">{`日付: ${label}`}</p>
        <p className="text-blue-600">{`日次損益: ${data.dailyPnL.toLocaleString()}円`}</p>
        <p className="text-green-600">{`累積損益: ${data.cumulativePnL.toLocaleString()}円`}</p>
        <p className="text-gray-600">{`取引数: ${data.tradeCount}件`}</p>
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

    return <circle cx={cx} cy={cy} r={r} fill="#2563eb" />
  }

    const getBarColor = (entry: ChartDataPoint) => {
    if (entry.dailyPnL > 0) return '#16a34a' // 緑
    if (entry.dailyPnL < 0) return '#dc2626' // 赤
    return '#9ca3af' // グレー（ゼロ）
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      month: 'short',
      day: 'numeric',
    })
  }

  const formatCurrency = (value: number) => {
    return `${value.toLocaleString()}円`
  }

  if (loading) {
    return (
      <div className="w-screen min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-500 mx-auto mb-4"></div>
          <p className="text-xl text-white">損益分析データを読み込み中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-screen min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-6">
        <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-8 max-w-md w-full text-center">
          <h3 className="text-red-300 font-semibold text-xl mb-4">エラーが発生しました</h3>
          <p className="text-red-200 mb-6">{error}</p>
          <button
            onClick={fetchData}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-all duration-200"
          >
            再試行
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-screen min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 overflow-x-hidden">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">損益分析</h1>
      </div>

      {/* フィルタコントロール */}
      <div className="bg-white p-4 rounded-lg shadow border space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              開始日
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              終了日
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              シンボル
            </label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="VIX"
            />
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            更新
          </button>
        </div>

        {/* ゼロ埋め設定 */}
        <div className="pt-3 border-t border-gray-200">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={fillZeroDates}
              onChange={(e) => setFillZeroDates(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">
              取引のない日も表示する（日付を連続表示）
            </span>
          </label>
          <p className="text-xs text-gray-500 mt-1 ml-6">
            チェックを外すと、実際に取引があった日のみが表示されます
          </p>
        </div>
      </div>

      {/* サマリー情報 */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg shadow border">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
              総損益
            </h3>
            <p className={`text-2xl font-bold ${
              data.summary.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {formatCurrency(data.summary.totalPnL)}
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
              取引数
            </h3>
            <p className="text-2xl font-bold text-gray-900">
              {data.summary.tradeCount.toLocaleString()}件
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
              勝率
            </h3>
            <p className="text-2xl font-bold text-blue-600">
              {(data.summary.winRate * 100).toFixed(1)}%
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow border">
            <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
              プロフィットファクター
            </h3>
            <p className="text-2xl font-bold text-purple-600">
              {data.summary.profitFactor.toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* 累積損益チャート */}
      {processedChartData.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow border">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">累積損益推移</h2>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={processedChartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fontSize: 12 }}
                />
                <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="cumulativePnL"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={<CustomDot />}
                  connectNulls={true}
                  activeDot={{
                    r: 4,
                    stroke: '#2563eb',
                    strokeWidth: 2,
                    fill: '#fff',
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 日次損益バーチャート */}
      {processedChartData.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow border">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">日次損益</h2>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={processedChartData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fontSize: 12 }}
                />
                <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="dailyPnL">
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

export default PnLAnalysisPage