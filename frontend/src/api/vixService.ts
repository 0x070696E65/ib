// frontend/src/api/vixService.ts
import type { OptionClosePrice, FetchSummary } from '../../../shared/types'

const BASE_URL = 'http://localhost:3001/api'

export async function fetchVixOption(strike = 18, contractMonth?: string): Promise<OptionClosePrice[]> {
  const params = new URLSearchParams()
  params.append('strike', strike.toString())
  if (contractMonth) params.append('contractMonth', contractMonth)

  const res = await fetch(`${BASE_URL}/vix-option?${params.toString()}`)
  const data = await res.json()
  return data.data
}

export async function fetchVixExpirations(): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/vix/expirations`)
  const data = await res.json()
  return data.data
}

export async function fetchAllVixData(): Promise<FetchSummary> {
  const res = await fetch(`${BASE_URL}/vix-data-fetch/all`, {
    method: 'POST',
  })
  return await res.json()
}

export async function fetchAllVixDataFromMongo(contract: string): Promise<OptionClosePrice[]> {
  const res = await fetch(`${BASE_URL}/vix/${contract}`)
  return await res.json()
}
