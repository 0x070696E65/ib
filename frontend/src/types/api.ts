// frontend/src/types/api.ts
import type { TradeExecution } from './trades'
import type { PositionWithPnL } from './positions'

export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
  error?: string
}

export interface ImportResult {
  imported: number
  skipped: number
}

export interface PositionMatchResult {
  matched: boolean
  tradeExecution?: TradeExecution
  position?: PositionWithPnL
}

export interface PositionMatchingResult {
  totalPositions: number
  matchedPositions: number
  results: PositionMatchResult[]
}

export interface BundleCreateRequest {
  name: string
  positionKeys: string[]
}

export interface TagPositionRequest {
  positionKey: string
  tag: 'P+' | 'P-'
}
