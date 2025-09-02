// frontend/src/api/futureService.ts
export interface FuturePrice {
  expiration: string
  symbol: string
  bid: number
  ask: number
  midPrice: number
  lastPrice: number
  volume?: number
}

export interface FuturePricesRequest {
  expirations: string[]
}

export interface FuturePricesResponse {
  success: boolean
  data: {
    expirations: string[]
    prices: Record<string, FuturePrice>
  }
  timestamp: string
  message: string
}

const API_BASE = 'http://localhost:3001/api'

/**
 * 複数満期のVIX先物価格を取得
 */
export const fetchFuturePrices = async (request: FuturePricesRequest): Promise<Record<string, FuturePrice>> => {
  const response = await fetch(`${API_BASE}/futures/prices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`VIX先物価格取得失敗: ${response.status} ${response.statusText}`)
  }

  const result: FuturePricesResponse = await response.json()

  if (!result.success) {
    throw new Error(result.message || 'VIX先物価格取得失敗')
  }

  return result.data.prices
}

/**
 * 単一満期のVIX先物価格を取得
 */
export const fetchSingleFuturePrice = async (expiration: string): Promise<FuturePrice> => {
  const response = await fetch(`${API_BASE}/futures/price/${expiration}`)

  if (!response.ok) {
    throw new Error(`VIX先物価格取得失敗: ${response.status} ${response.statusText}`)
  }

  const result = await response.json()

  if (!result.success) {
    throw new Error(result.message || 'VIX先物価格取得失敗')
  }

  return result.data
}
