// frontend/src/api/tradeService.ts

import type { BundleCreateRequest, TagPositionRequest, PositionMatchingResult } from '../types/api'
import type { TradeOrder, AnalysisData } from '../types/trades'

const BASE_URL = `${import.meta.env.VITE_API_URL}/trades`

// Flex Query データをインポート
export async function importFlexData(): Promise<{ imported: number; skipped: number }> {
  const response = await fetch(`${BASE_URL}/import-flex-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Import failed: ${response.statusText}`)
  }

  const result = await response.json()
  return result.data
}

// ポジションマッチング結果を取得
export async function fetchPositionMatching(): Promise<PositionMatchingResult> {
  const response = await fetch(`${BASE_URL}/position-matching`)

  if (!response.ok) {
    throw new Error(`Position matching failed: ${response.statusText}`)
  }

  const result = await response.json()
  return result.data
}

// バンドルを作成
export async function createBundle(request: BundleCreateRequest): Promise<{ bundleId: string }> {
  const response = await fetch(`${BASE_URL}/bundles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`Bundle creation failed: ${response.statusText}`)
  }

  const result = await response.json()
  return result.data
}

// 単独ポジションにタグ付け
export async function tagPosition(request: TagPositionRequest): Promise<void> {
  const response = await fetch(`${BASE_URL}/tag-position`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`Position tagging failed: ${response.statusText}`)
  }
}

// 分析データを取得
export async function fetchAnalysisData(): Promise<AnalysisData> {
  const response = await fetch(`${BASE_URL}/analysis`)

  if (!response.ok) {
    throw new Error(`Analysis data fetch failed: ${response.statusText}`)
  }

  const result = await response.json()
  return result.data
}

// 取引履歴を取得
export async function fetchTradeHistory(filters?: {
  symbol?: string
  status?: 'OPEN' | 'CLOSED' | 'EXPIRED'
  tag?: 'PP' | 'P-' | 'P+'
  startDate?: string
  endDate?: string
}): Promise<TradeOrder[]> {
  const params = new URLSearchParams()

  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params.append(key, value)
      }
    })
  }

  const url = `${BASE_URL}/history${params.toString() ? `?${params.toString()}` : ''}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Trade history fetch failed: ${response.statusText}`)
  }

  const result = await response.json()
  return result.data
}
