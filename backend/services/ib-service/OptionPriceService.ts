// backend/services/ib-service/OptionPriceService.ts
import { EventName, SecType, Contract, OptionType } from '@stoqey/ib'
import { IbService } from './IbService'

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

export interface OptionPriceRequest {
  expiration: string
  strikeMin: number
  strikeMax: number
  stepSize?: number
}

export class OptionPriceService {
  private marketDataSubscriptions = new Map<number, OptionPrice>()

  constructor(private ibService: IbService) {
    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    const ibApi = this.ibService.getIbApi()

    // Only setup essential price events to avoid type conflicts
    ibApi.on(EventName.tickPrice, this.onTickPrice.bind(this))

    // Skip problematic events for now - we can get basic pricing without them
    // ibApi.on(EventName.tickSize as any, this.onTickSize.bind(this))
    // ibApi.on(EventName.tickOptionComputation as any, this.onTickOptionComputation.bind(this))
    // ibApi.on(EventName.tickGeneric as any, this.onTickGeneric.bind(this))
  }

  private onTickPrice(reqId: number, tickType: number, price: number): void {
    const request = this.ibService.getPendingRequest(reqId)
    if (!request || !request.optionPrice) return

    // TickType: 1=bid, 2=ask, 4=last
    switch (tickType) {
      case 1: // bid
        request.optionPrice.bid = price
        break
      case 2: // ask
        request.optionPrice.ask = price
        break
      case 4: // last
        request.optionPrice.lastPrice = price
        break
    }

    // Mid price calculation
    if (request.optionPrice.bid > 0 && request.optionPrice.ask > 0) {
      request.optionPrice.midPrice = (request.optionPrice.bid + request.optionPrice.ask) / 2
    }

    this.checkRequestCompletion(reqId)
  }

  private onTickSize(reqId: number, tickType: number, size: number): void {
    const request = this.ibService.getPendingRequest(reqId)
    if (!request || !request.optionPrice) return

    // TickType: 8=volume
    if (tickType === 8) {
      request.optionPrice.volume = size
    }
  }

  private onTickOptionComputation(
    reqId: number,
    tickType: number,
    impliedVol: number,
    delta: number,
    optPrice: number,
    pvDividend: number,
    gamma: number,
    vega: number,
    theta: number,
    undPrice: number
  ): void {
    const request = this.ibService.getPendingRequest(reqId)
    if (!request || !request.optionPrice) return

    // TickType: 10=bid, 11=ask, 12=last
    if (tickType === 10 || tickType === 11 || tickType === 12) {
      request.optionPrice.impliedVolatility = impliedVol >= 0 ? impliedVol : undefined
      request.optionPrice.delta = delta >= -2 && delta <= 2 ? delta : undefined
      request.optionPrice.gamma = gamma >= -2 && gamma <= 2 ? gamma : undefined
      request.optionPrice.theta = theta >= -2 && theta <= 2 ? theta : undefined
      request.optionPrice.vega = vega >= -2 && vega <= 2 ? vega : undefined
    }
  }

  private onTickGeneric(reqId: number, tickType: number, value: number): void {
    // Additional generic tick handling if needed
  }

  private checkRequestCompletion(reqId: number): void {
    const request = this.ibService.getPendingRequest(reqId)
    if (!request || request.resolved) return

    const optPrice = request.optionPrice

    // Consider request complete if we have bid and ask prices
    if (optPrice.bid > 0 && optPrice.ask > 0) {
      if (!request.resolved) {
        request.resolved = true
        request.resolve(optPrice)
        this.ibService.removePendingRequest(reqId)
      }
    }
  }

  /**
   * 単一オプションの価格を取得
   */
  public async getSingleOptionPrice(expiration: string, strike: number): Promise<OptionPrice> {
    await this.ibService.connect()

    return new Promise<OptionPrice>((resolve, reject) => {
      const reqId = this.ibService.getNextRequestId()

      const optionPrice: OptionPrice = {
        expiration,
        strike,
        bid: 0,
        ask: 0,
        midPrice: 0,
        lastPrice: 0,
      }

      this.ibService.addPendingRequest(reqId, {
        optionPrice,
        resolve,
        reject,
        resolved: false,
        timestamp: Date.now(),
      })

      // タイムアウト設定（15秒）
      const timeoutId = setTimeout(() => {
        const request = this.ibService.getPendingRequest(reqId)
        if (request && !request.resolved) {
          request.resolved = true
          console.warn(`オプション価格取得タイムアウト: ${expiration} ${strike}P`)

          // 部分的なデータでも返す
          if (optionPrice.bid > 0 || optionPrice.ask > 0 || optionPrice.lastPrice > 0) {
            resolve(optionPrice)
          } else {
            reject(new Error(`オプション価格取得タイムアウト: ${expiration} ${strike}P`))
          }

          // Market data subscription cancel
          this.ibService.getIbApi().cancelMktData(reqId)
          this.ibService.removePendingRequest(reqId)
        }
      }, 15000)

      const contract: Contract = {
        symbol: 'VIX',
        secType: SecType.OPT,
        exchange: 'SMART',
        currency: 'USD',
        lastTradeDateOrContractMonth: expiration,
        strike: strike,
        right: OptionType.Put, // PUT option
        multiplier: 100,
      }

      this.ibService.getIbApi().reqMktData(reqId, contract, '', false, false)
    })
  }

  /**
   * 指定した範囲のオプション価格を取得
   */
  public async getOptionPrices(request: OptionPriceRequest): Promise<OptionPrice[]> {
    const { expiration, strikeMin, strikeMax, stepSize = 1 } = request
    const results: OptionPrice[] = []
    const errors: string[] = []

    console.log(`オプション価格一括取得開始: ${expiration}, ストライク ${strikeMin}-${strikeMax} (${stepSize}刻み)`)

    // Sequential requests to avoid overwhelming IB
    for (let strike = strikeMin; strike <= strikeMax; strike += stepSize) {
      try {
        const optionPrice = await this.getSingleOptionPrice(expiration, strike)
        results.push(optionPrice)

        // Rate limiting: wait 100ms between requests
        await new Promise((resolve) => setTimeout(resolve, 100))
      } catch (error) {
        const errorMsg = `Strike ${strike}: ${error instanceof Error ? error.message : 'Unknown error'}`
        console.warn(`オプション価格取得エラー: ${errorMsg}`)
        errors.push(errorMsg)
      }
    }

    console.log(`オプション価格一括取得完了: 成功 ${results.length}件, エラー ${errors.length}件`)

    if (errors.length > 0) {
      console.warn('取得エラー詳細:', errors)
    }

    return results
  }

  /**
   * 複数満期の価格を取得
   */
  public async getMultiExpirationPrices(
    expirations: string[],
    strikeMin: number,
    strikeMax: number,
    stepSize = 1
  ): Promise<Map<string, OptionPrice[]>> {
    const results = new Map<string, OptionPrice[]>()

    for (const expiration of expirations) {
      try {
        console.log(`満期 ${expiration} の価格取得開始`)
        const prices = await this.getOptionPrices({
          expiration,
          strikeMin,
          strikeMax,
          stepSize,
        })
        results.set(expiration, prices)

        // Rate limiting between expirations
        await new Promise((resolve) => setTimeout(resolve, 500))
      } catch (error) {
        console.error(`満期 ${expiration} の価格取得失敗:`, error)
        results.set(expiration, [])
      }
    }

    return results
  }

  /**
   * アクティブなマーケットデータ購読をキャンセル
   */
  public cancelAllSubscriptions(): void {
    console.log('全マーケットデータ購読をキャンセル中...')

    for (const [reqId] of this.marketDataSubscriptions) {
      this.ibService.getIbApi().cancelMktData(reqId)
      this.ibService.removePendingRequest(reqId)
    }

    this.marketDataSubscriptions.clear()
  }
}
