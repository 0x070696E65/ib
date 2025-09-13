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

export interface TradeDetail {
  _id: string
  orderID: number
  tradeDate: string
  symbol: string
  description: string
  buySell: 'BUY' | 'SELL'
  totalQuantity: number
  avgPrice: number
  totalRealizedPnL: number
  tag?: string
  bundleId?: string
  positionStatus: string
  expiry?: string
  strike?: number
  putCall?: 'P' | 'C'
}

export interface TradeDetailsResult {
  trades: TradeDetail[]
  totalCount: number
  currentPage: number
  totalPages: number
}

const BASE_URL = import.meta.env.VITE_API_URL

export const fetchBasicPnLAnalysis = async (
  startDate?: string,
  endDate?: string,
  symbol = 'VIX',
  tag?: string
): Promise<PnLAnalysisResult> => {
  const params = new URLSearchParams()
  if (startDate) params.append('startDate', startDate)
  if (endDate) params.append('endDate', endDate)
  if (symbol !== 'VIX') params.append('symbol', symbol)
  if (tag) params.append('tag', tag)

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

export const fetchTradeDetails = async (
  startDate?: string,
  endDate?: string,
  symbol = 'VIX',
  tag?: string,
  page = 1,
  limit = 50,
  sortBy = 'tradeDate',
  sortOrder: 'asc' | 'desc' = 'desc'
): Promise<TradeDetailsResult> => {
  const params = new URLSearchParams()
  if (startDate) params.append('startDate', startDate)
  if (endDate) params.append('endDate', endDate)
  if (symbol !== 'VIX') params.append('symbol', symbol)
  if (tag) params.append('tag', tag)
  params.append('page', page.toString())
  params.append('limit', limit.toString())
  params.append('sortBy', sortBy)
  params.append('sortOrder', sortOrder)

  const response = await fetch(`${BASE_URL}/pnl/trades?${params.toString()}`)

  if (!response.ok) {
    throw new Error(`取引詳細取得失敗: ${response.status}`)
  }

  const result = await response.json()

  if (!result.success) {
    throw new Error(result.message || '取引詳細取得失敗')
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
