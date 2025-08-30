// services/ib-service/types.ts
export interface OptionClosePrice {
  contract: string
  strike: number
  data: { date: Date; close: number }[]
  requestedDuration?: string
  actualDataPoints?: number
}

export interface FutureClosePrice {
  contract: string
  data: { date: Date; close: number }[]
  requestedDuration?: string
  actualDataPoints?: number
}

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

export interface PositionSummary {
  totalPositions: number
  totalMarketValue: number
  longPositions: number
  shortPositions: number
  accounts: string[]
  symbols: string[]
}

export interface ConnectionInfo {
  host: string
  port: number
  clientId: number
  connected: boolean
  pendingRequests: number
}

export interface PendingRequestInfo {
  requestId: number
  type: string
  contract: string
  strike: string
  duration: string
  elapsed: number
}

export interface PendingRequestsStatus {
  count: number
  requests: PendingRequestInfo[]
}
