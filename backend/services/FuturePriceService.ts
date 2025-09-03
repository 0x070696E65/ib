// backend/services/FuturePriceService.ts
import { EventName, SecType, Contract } from '@stoqey/ib'
import { IbService } from './IbService'

export interface FuturePrice {
  expiration: string // "20250916"
  symbol: string // "VIX"
  bid: number // 22.15
  ask: number // 22.25
  midPrice: number // 22.20
  lastPrice: number // 22.18
  volume?: number
}

export class FuturePriceService {
  constructor(private ibService: IbService) {
    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    const ibApi = this.ibService.getIbApi()
    ibApi.on(EventName.tickPrice, this.onTickPrice.bind(this))
  }

  private onTickPrice(reqId: number, tickType: number, price: number): void {
    const request = this.ibService.getPendingRequest(reqId)
    if (!request || !request.futurePrice) return

    // TickType: 1=bid, 2=ask, 4=last
    switch (tickType) {
      case 1: // bid
        request.futurePrice.bid = price
        break
      case 2: // ask
        request.futurePrice.ask = price
        break
      case 4: // last
        request.futurePrice.lastPrice = price
        break
    }

    // Mid price calculation
    if (request.futurePrice.bid > 0 && request.futurePrice.ask > 0) {
      request.futurePrice.midPrice = (request.futurePrice.bid + request.futurePrice.ask) / 2
    }

    this.checkRequestCompletion(reqId)
  }

  private checkRequestCompletion(reqId: number): void {
    const request = this.ibService.getPendingRequest(reqId)
    if (!request || request.resolved) return

    const futPrice = request.futurePrice

    // Consider request complete if we have bid and ask prices
    if (futPrice.bid > 0 && futPrice.ask > 0) {
      if (!request.resolved) {
        request.resolved = true
        request.resolve(futPrice)
        this.ibService.removePendingRequest(reqId)
      }
    }
  }

  /**
   * 単一先物の価格を取得
   */
  public async getSingleFuturePrice(expiration: string): Promise<FuturePrice> {
    await this.ibService.connect()

    return new Promise<FuturePrice>((resolve, reject) => {
      const reqId = this.ibService.getNextRequestId()

      const futurePrice: FuturePrice = {
        expiration,
        symbol: 'VIX',
        bid: 0,
        ask: 0,
        midPrice: 0,
        lastPrice: 0,
      }

      this.ibService.addPendingRequest(reqId, {
        futurePrice,
        resolve,
        reject,
        resolved: false,
        timestamp: Date.now(),
      })

      // タイムアウト設定（10秒）
      const timeoutId = setTimeout(() => {
        const request = this.ibService.getPendingRequest(reqId)
        if (request && !request.resolved) {
          request.resolved = true
          console.warn(`VIX先物価格取得タイムアウト: ${expiration}`)

          if (futurePrice.bid > 0 || futurePrice.ask > 0 || futurePrice.lastPrice > 0) {
            resolve(futurePrice)
          } else {
            reject(new Error(`VIX先物価格取得タイムアウト: ${expiration}`))
          }

          this.ibService.getIbApi().cancelMktData(reqId)
          this.ibService.removePendingRequest(reqId)
        }
      }, 10000)

      const contract: Contract = {
        symbol: 'VIX',
        secType: SecType.FUT,
        exchange: 'CFE',
        currency: 'USD',
        lastTradeDateOrContractMonth: this.addOneDay(expiration),
        tradingClass: 'VX',
        multiplier: 1000,
      }

      this.ibService.getIbApi().reqMktData(reqId, contract, '', false, false)
    })
  }

  addOneDay(dateStr: string): string {
    // "YYYYMMDD" → Date に変換
    const year = parseInt(dateStr.substring(0, 4), 10)
    const month = parseInt(dateStr.substring(4, 6), 10) - 1 // JSの月は0始まり
    const day = parseInt(dateStr.substring(6, 8), 10)

    const date = new Date(year, month, day)

    // 1日加算
    date.setDate(date.getDate() + 1)

    // フォーマットを "YYYYMMDD" に戻す
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')

    return `${yyyy}${mm}${dd}`
  }

  /**
   * 複数満期の先物価格を取得
   */
  public async getMultipleFuturePrices(expirations: string[]): Promise<Map<string, FuturePrice>> {
    const results = new Map<string, FuturePrice>()
    const errors: string[] = []

    console.log(`VIX先物価格一括取得開始: ${expirations.length}件`)

    // Sequential requests to avoid overwhelming IB
    for (const expiration of expirations) {
      try {
        const futurePrice = await this.getSingleFuturePrice(expiration)
        results.set(expiration, futurePrice)

        // Rate limiting: wait 200ms between requests
        await new Promise((resolve) => setTimeout(resolve, 200))
      } catch (error) {
        const errorMsg = `${expiration}: ${error instanceof Error ? error.message : 'Unknown error'}`
        console.warn(`VIX先物価格取得エラー: ${errorMsg}`)
        errors.push(errorMsg)
      }
    }

    console.log(`VIX先物価格一括取得完了: 成功 ${results.size}件, エラー ${errors.length}件`)

    if (errors.length > 0) {
      console.warn('取得エラー詳細:', errors)
    }

    return results
  }

  /**
   * アクティブな購読をキャンセル
   */
  public cancelAllSubscriptions(): void {
    console.log('全VIX先物データ購読をキャンセル中...')
    // Implementation similar to OptionPriceService
  }
}
