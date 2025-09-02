// frontend/src/types/futures.ts
export interface FuturePrice {
  expiration: string
  symbol: string
  bid: number
  ask: number
  midPrice: number
  lastPrice: number
  volume?: number
}
