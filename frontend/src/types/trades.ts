// frontend/src/types/trades.ts
export interface TradeExecution {
  _id: string
  accountId: string
  symbol: string
  secType: string
  description?: string

  strike?: number
  expiry?: string
  putCall?: 'P' | 'C'
  multiplier?: number

  tradeDate: string
  tradeTime?: string
  quantity: number
  price: number
  amount: number
  proceeds: number
  buySell: 'BUY' | 'SELL'
  exchange?: string

  ibCommission: number
  ibCommissionCurrency?: string
  netCash: number
  realizedPnL?: number

  execID: string
  orderID?: number
  ibOrderID?: string

  bundleId?: string
  tag?: 'PP' | 'P-' | 'P+'

  positionStatus: 'OPEN' | 'CLOSED' | 'EXPIRED'
  closeDate?: string

  dataSource: 'FLEX_QUERY' | 'REAL_TIME' | 'MANUAL'

  createdAt: string
  updatedAt: string
}

export interface TradeBundle {
  _id: string
  bundleId: string
  name: string
  tag: 'PP'

  symbol: string
  expiry: string
  createdDate: string

  executionIds: string[]

  totalQuantity: number
  totalPnL: number
  averagePrice: number

  status: 'OPEN' | 'CLOSED' | 'EXPIRED'

  createdAt: string
  updatedAt: string
}

export interface AnalysisData {
  byTag: Record<string, { count: number; totalPnL: number; avgPnL: number }>
  byBundle: Array<{
    bundleId: string
    name: string
    totalPnL: number
    executionCount: number
    status: string
  }>
  summary: {
    totalTrades: number
    totalPnL: number
    winRate: number
  }
}
