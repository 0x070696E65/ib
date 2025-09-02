// frontend/src/types/options.ts
export interface OptionPrice {
  expiration: string // "20250916"
  strike: number // 24
  bid: number // 4.75
  ask: number // 4.81
  midPrice: number // 4.78
  lastPrice: number // 4.77
  volume?: number
  impliedVolatility?: number
  delta?: number
  gamma?: number
  theta?: number
  vega?: number
}

export interface ProfitCalculation {
  strike: number
  premium: number
  quantity: number
  scenarios: Array<{
    futurePrice: number
    profit: number
  }>
}

export interface ProfitAnalysis {
  breakEvenPoint: number | null
  maxProfit: number
  maxLoss: number
  profitableRange: {
    min: number | null
    max: number | null
  }
}

export interface Expiration {
  expiration: string
  formatted: string
}

export interface MatrixCellData {
  expiration: string
  strike: number
  price?: OptionPrice
  loading?: boolean
  error?: string
}

export interface ProfitScenario {
  futurePrice: number
  profit: number
}
