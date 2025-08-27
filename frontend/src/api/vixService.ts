// frontend/src/api/vixService.ts
import type { OptionClosePrice, FetchSummary } from '../../../shared/types'

const BASE_URL = 'http://localhost:3001/api'

export async function fetchVixExpirations(): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/vix/expirations`)
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
