// frontend/src/api/cacheService.ts
import type { OptionPrice } from '../types/options'
import type { FuturePrice } from '../types/futures'
import type { StrategyPair } from '../utils/strategyCalculations'

export interface CacheSummary {
  hasCache: boolean
  fetchDate?: string
  strikeRange?: { min: number; max: number; step: number }
  expirations?: string[]
  totalOptions?: number
  totalStrategies?: number
  fetchDuration?: number
  ageInHours?: number
}

export interface CacheData {
  id: string
  fetchDate: string
  optionPrices: Record<string, OptionPrice[]>
  futurePrices: Record<string, FuturePrice>
  strategies: StrategyPair[]
  expirations: string[] // 追加
  metadata: {
    totalOptions: number
    totalStrategies: number
    fetchDuration: number
    priceSource: 'IB_API' | 'CACHED'
  }
}
const BASE_URL = import.meta.env.VITE_API_URL

export const fetchCacheSummary = async (): Promise<CacheSummary> => {
  const response = await fetch(`${BASE_URL}/cache/summary`)

  if (!response.ok) {
    throw new Error(`キャッシュ概要取得失敗: ${response.status}`)
  }

  const result = await response.json()

  if (!result.success) {
    throw new Error(result.message || 'キャッシュ概要取得失敗')
  }

  return result.data
}

export const fetchLatestCache = async (): Promise<CacheData | null> => {
  const response = await fetch(`${BASE_URL}/cache/latest`)

  if (!response.ok) {
    throw new Error(`キャッシュデータ取得失敗: ${response.status}`)
  }

  const result = await response.json()

  if (!result.success) {
    throw new Error(result.message || 'キャッシュデータ取得失敗')
  }

  return result.data
}

export const checkCacheValidity = async (request: {
  expirations: string[]
  strikeMin: number
  strikeMax: number
  stepSize: number
}): Promise<boolean> => {
  const response = await fetch(`${BASE_URL}/cache/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`キャッシュチェック失敗: ${response.status}`)
  }

  const result = await response.json()

  if (!result.success) {
    throw new Error(result.message || 'キャッシュチェック失敗')
  }

  return result.data.isValid
}

export const clearCache = async (): Promise<void> => {
  const response = await fetch(`${BASE_URL}/cache`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw new Error(`キャッシュ削除失敗: ${response.status}`)
  }

  const result = await response.json()

  if (!result.success) {
    throw new Error(result.message || 'キャッシュ削除失敗')
  }
}

export interface SaveCacheRequest {
  expirations: string[]
  strikeMin: number
  strikeMax: number
  stepSize: number
  optionPrices: Record<string, OptionPrice[]>
  futurePrices: Record<string, FuturePrice>
  strategies: StrategyPair[]
  fetchDuration: number
}

export const savePriceDataToCache = async (request: SaveCacheRequest): Promise<string> => {
  const response = await fetch(`${BASE_URL}/cache/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`キャッシュ保存失敗: ${response.status}`)
  }

  const result = await response.json()

  if (!result.success) {
    throw new Error(result.message || 'キャッシュ保存失敗')
  }

  return result.data.id
}
