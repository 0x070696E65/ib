// frontend/src/api/vixService.ts
import type { OptionClosePrice, FetchSummary } from '../../../shared/types'

const BASE_URL = 'http://macbook-pro.local:3001/api'

export async function updateVixExpirations(): Promise<void> {
  const res = await fetch(`${BASE_URL}/vix-expirations/update`)
  console.log(res)
  if (!res.ok) {
    throw new Error('VIX満期日更新失敗')
  }
}

export async function fetchVixExpirations(isEnded: boolean = false): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/vix-expirations/options?isEnded=${isEnded}`)
  const data = await res.json()
  return data.data
}

export async function fetchVixFutureExpirations(isEnded: boolean = false): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/vix-expirations/futures?isEnded=${isEnded}`)
  const data = await res.json()
  return data.data
}

export async function fetchAllVixData(): Promise<FetchSummary> {
  const res = await fetch(`${BASE_URL}/vix-option/all`, {
    method: 'POST',
  })
  return await res.json()
}

export async function fetchAllVixDataFromMongo(contract: string): Promise<OptionClosePrice[]> {
  const res = await fetch(`${BASE_URL}/vix-option/${contract}`)
  return await res.json()
}

export async function fetchAllVixFutureData(): Promise<FetchSummary> {
  const res = await fetch(`${BASE_URL}/vix-future/all`, {
    method: 'POST',
  })
  return await res.json()
}

export async function fetchAllVixFutureDataFromMongo(contract: string): Promise<OptionClosePrice[]> {
  const res = await fetch(`${BASE_URL}/vix-future/${contract}`)
  return await res.json()
}
