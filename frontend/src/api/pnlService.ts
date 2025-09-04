// frontend/src/api/pnlService.ts
export interface BasicPnLData {
  date: string
  dailyPnL: number
  cumulativePnL: number
  tradeCount: number
}

export interface PeriodPnLSummary {
  totalPnL: number
  tradeCount: number
  winCount: number
  lossCount: number
  winRate: number
  avgWin: number
  avgLoss: number
  profitFactor: number
}

export interface PnLAnalysisResult {
  summary: PeriodPnLSummary
  dailyData: BasicPnLData[]
  dateRange: {
    start: string
    end: string
  }
}

const BASE_URL = import.meta.env.VITE_API_URL

export const fetchBasicPnLAnalysis = async (
  startDate?: string,
  endDate?: string,
  symbol = 'VIX'
): Promise<PnLAnalysisResult> => {
  const params = new URLSearchParams()
  if (startDate) params.append('startDate', startDate)
  if (endDate) params.append('endDate', endDate)
  if (symbol !== 'VIX') params.append('symbol', symbol)

  const response = await fetch(`${BASE_URL}/pnl/basic?${params.toString()}`)

  if (!response.ok) {
    throw new Error(`損益分析取得失敗: ${response.status}`)
  }

  const result = await response.json()

  if (!result.success) {
    throw new Error(result.message || '損益分析取得失敗')
  }

  return result.data
}

export const fetchMonthlyPnLAnalysis = async (
  startDate?: string,
  endDate?: string,
  symbol = 'VIX'
): Promise<
  Array<{
    month: string
    totalPnL: number
    tradeCount: number
    winRate: number
  }>
> => {
  const params = new URLSearchParams()
  if (startDate) params.append('startDate', startDate)
  if (endDate) params.append('endDate', endDate)
  if (symbol !== 'VIX') params.append('symbol', symbol)

  const response = await fetch(`${BASE_URL}/pnl/monthly?${params.toString()}`)

  if (!response.ok) {
    throw new Error(`月次分析取得失敗: ${response.status}`)
  }

  const result = await response.json()

  if (!result.success) {
    throw new Error(result.message || '月次分析取得失敗')
  }

  return result.data
}

export const fetchTagAnalysis = async (
  startDate?: string,
  endDate?: string,
  symbol = 'VIX'
): Promise<
  Array<{
    tag: string
    totalPnL: number
    tradeCount: number
    winRate: number
    avgPnL: number
  }>
> => {
  const params = new URLSearchParams()
  if (startDate) params.append('startDate', startDate)
  if (endDate) params.append('endDate', endDate)
  if (symbol !== 'VIX') params.append('symbol', symbol)

  const response = await fetch(`${BASE_URL}/pnl/tags?${params.toString()}`)

  if (!response.ok) {
    throw new Error(`タグ分析取得失敗: ${response.status}`)
  }

  const result = await response.json()

  if (!result.success) {
    throw new Error(result.message || 'タグ分析取得失敗')
  }

  return result.data
}
