// frontend/src/types/api.ts - 修正版

import type { TradeOrder } from './trades'
import type { Position } from './positions'

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
  tradeOrder?: TradeOrder
  position?: Position
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
