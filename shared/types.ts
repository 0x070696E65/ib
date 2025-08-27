export interface OptionClosePrice {
  contract: string
  strike: number
  date: Date
  close: number
}

export interface FutureClosePrice {
  contract: string
  date: Date
  close: number
}

export interface FetchProgress {
  expiration: string
  strike: number
  status: 'success' | 'error'
  dataCount?: number
  error?: string
}

export interface FetchSummary {
  duration: string
  expirations: number
  totalRequests: number
  successCount: number
  errorCount: number
  message: string
  details: FetchProgress[]
}
