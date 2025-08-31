// frontend/src/types/positions.ts
export interface Position {
  account: string
  symbol: string
  secType: string
  exchange: string
  currency: string
  position: number
  avgCost: number
  marketValue?: number
  contractId?: number
  localSymbol?: string
}

export interface PositionWithPnL extends Position {
  dailyPnL?: number
  unrealizedPnL?: number
  realizedPnL?: number
  value?: number
  strike?: number | null
  expiry?: string | null
  mark?: number
  optionType?: 'PUT' | 'CALL' | null
}
