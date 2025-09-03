// frontend/src/api/optionService.ts
import type { OptionPrice /* ProfitCalculation */ } from '../types/options'

const BASE_URL = import.meta.env.VITE_API_URL

export interface OptionPriceRequest {
  expiration: string
  strikeMin: number
  strikeMax: number
  stepSize?: number
}

export interface MultiExpirationRequest {
  expirations: string[]
  strikeMin: number
  strikeMax: number
  stepSize?: number
}

export interface CalculateRequest {
  strike: number
  premium: number
  quantity: number
  scenarioMin: number
  scenarioMax: number
  stepSize?: number
}

// 指定範囲のオプション価格を取得
export async function fetchOptionPrices(request: OptionPriceRequest): Promise<{
  expiration: string
  strikeRange: { min: number; max: number; step: number }
  prices: OptionPrice[]
  summary: {
    total: number
    withBidAsk: number
    avgSpread: number
  }
}> {
  const response = await fetch(`${BASE_URL}/options/prices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`Price fetch failed: ${response.statusText}`)
  }

  const result = await response.json()
  return result.data
}

// 単一オプションの価格を取得
export async function fetchSingleOptionPrice(expiration: string, strike: number): Promise<OptionPrice> {
  const response = await fetch(`${BASE_URL}/options/prices/${expiration}/${strike}`)

  if (!response.ok) {
    throw new Error(`Single price fetch failed: ${response.statusText}`)
  }

  const result = await response.json()
  return result.data
}

// 複数満期の価格を取得
export async function fetchMultiExpirationPrices(request: MultiExpirationRequest): Promise<{
  expirations: string[]
  strikeRange: { min: number; max: number; step: number }
  results: Record<string, OptionPrice[]>
  summary: {
    totalExpirations: number
    totalPrices: number
    averagePricesPerExpiration: number
  }
}> {
  const response = await fetch(`${BASE_URL}/options/prices/multi`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`Multi expiration fetch failed: ${response.statusText}`)
  }

  const result = await response.json()
  return result.data
}

// 損益計算
export async function calculateProfit(request: CalculateRequest): Promise<{
  strike: number
  premium: number
  quantity: number
  scenarios: Array<{ futurePrice: number; profit: number }>
  analysis: {
    breakEvenPoint: number | null
    maxProfit: number
    maxLoss: number
    profitableRange: {
      min: number | null
      max: number | null
    }
  }
}> {
  const response = await fetch(`${BASE_URL}/options/calculate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`Calculation failed: ${response.statusText}`)
  }

  const result = await response.json()
  return result.data
}

// 利用可能な満期日を取得
export async function fetchAvailableExpirations(): Promise<
  Array<{
    expiration: string
    formatted: string
  }>
> {
  const response = await fetch(`${BASE_URL}/options/expirations`)

  if (!response.ok) {
    throw new Error(`Expirations fetch failed: ${response.statusText}`)
  }

  const result = await response.json()
  return result.data
}
