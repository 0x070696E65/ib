// backend/services/ibService.ts (日数指定対応版)
import { IBApi, EventName, SecType, OptionType, BarSizeSetting, WhatToShow, Contract } from '@stoqey/ib'
import { DateTime } from 'luxon'

export interface OptionClosePrice {
  contract: string
  strike: number
  data: { date: Date; close: number }[]
  requestedDuration?: string
  actualDataPoints?: number
}

export class IbServiceManager {
  private static instance: IbService

  static getInstance(): IbService {
    if (!this.instance) {
      this.instance = new IbService(4001, '127.0.0.1', 10)
    }
    return this.instance
  }
}

export class IbService {
  private ib: IBApi
  private connected: boolean = false
  private host: string
  private port: number
  private clientId: number
  private requestIdCounter: number = 5000
  private pendingRequests: Map<number, any> = new Map()

  constructor(port = 4001, host = '127.0.0.1', clientId = 10) {
    this.host = host
    this.port = port
    this.clientId = clientId

    this.ib = new IBApi({
      port: this.port,
      host: this.host,
      clientId: this.clientId,
    })

    console.log(`IBサービス初期化: ${host}:${port} (ClientID: ${clientId})`)
    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    this.ib.on(EventName.historicalData, this.onHistoricalData.bind(this))
    this.ib.on(EventName.contractDetails, this.onContractDetails.bind(this))
    this.ib.on(EventName.error, this.onError.bind(this))
  }

  private onHistoricalData(
    tickerId: number,
    bar: string,
    open: number,
    high: number,
    low: number,
    close: number
  ): void {
    const request = this.pendingRequests.get(tickerId)
    if (!request) return

    if (typeof bar === 'string' && bar.startsWith('finished-')) {
      if (!request.resolved) {
        request.resolved = true
        request.resolve({
          contract: request.contractMonth,
          strike: request.strike,
          data: request.historicalDataArray,
          requestedDuration: request.duration,
          actualDataPoints: request.historicalDataArray.length,
        })
        this.pendingRequests.delete(tickerId)
        console.log(
          `データ取得完了: ${request.contractMonth} Strike:${request.strike} (${request.duration}) - ${request.historicalDataArray.length}件`
        )
      }
    } else {
      const barDate = DateTime.fromFormat(bar.split(' US/Central')[0], 'yyyyLLdd HH:mm:ss', {
        zone: 'US/Central',
      }).toJSDate()

      if ((!request.fromDate || barDate > request.fromDate) && barDate < request.todayStart) {
        request.historicalDataArray.push({ date: barDate, close })
      }
    }
  }

  private onContractDetails(reqId: number, contractDetails: any): void {
    const request = this.pendingRequests.get(reqId)
    if (!request) return

    const expiry = contractDetails.contract.lastTradeDateOrContractMonth
    if (expiry) {
      request.expirations.add(expiry)
    }
  }

  private onError(err: Error, code: number, reqId?: number): void {
    console.warn(`IBエラー (Code: ${code}):`, err.message)

    if (reqId && this.pendingRequests.has(reqId)) {
      const request = this.pendingRequests.get(reqId)
      if (!request.resolved) {
        request.resolved = true
        request.reject(new Error(`IBエラー (Code: ${code}): ${err.message}`))
        this.pendingRequests.delete(reqId)
      }
    }

    if (code >= 500 && code < 600) {
      this.connected = false
    }
  }

  async connect(): Promise<void> {
    if (this.connected) {
      console.log('既に接続済みです')
      return
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`接続タイムアウト (${this.host}:${this.port})`))
      }, 15000)

      this.ib.on(EventName.connected, () => {
        clearTimeout(timeout)
        this.connected = true
        console.log(`IBサービスに接続しました (ClientID: ${this.clientId})`)
        resolve()
      })

      console.log(`IBサービス接続開始: ${this.host}:${this.port}`)
      this.ib.connect()
    })
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      try {
        for (const [reqId, request] of this.pendingRequests) {
          if (!request.resolved) {
            request.resolved = true
            request.reject(new Error('接続が切断されました'))
          }
        }
        this.pendingRequests.clear()

        this.ib.disconnect()
        this.connected = false
        console.log('IBサービスから切断しました')
      } catch (error) {
        console.warn('切断時エラー:', error)
      }
    }
  }

  private getNextRequestId(): number {
    return ++this.requestIdCounter
  }

  /**
   * VIXオプションの履歴データを取得
   * @param contractMonth 満期日 (例: '20251217')
   * @param strike ストライク価格
   * @param durationDays 取得日数 (デフォルト: 360日)
   * @param fromDate 開始日 (指定された場合は追加フィルタリング)
   */
  async fetchVixOptionBars(
    contractMonth: string,
    strike: number,
    durationDays: number = 360,
    fromDate?: Date
  ): Promise<OptionClosePrice> {
    await this.connect()

    return new Promise((resolve, reject) => {
      const requestId = this.getNextRequestId()
      const optionContract: Contract = {
        symbol: 'VIX',
        secType: SecType.OPT,
        exchange: 'SMART',
        currency: 'USD',
        lastTradeDateOrContractMonth: contractMonth,
        strike,
        right: OptionType.Put,
      }

      const historicalDataArray: { date: Date; close: number }[] = []
      const todayStart = DateTime.now().setZone('US/Central').startOf('day').toJSDate()
      const duration = `${durationDays} D`

      // リクエスト情報を保存
      this.pendingRequests.set(requestId, {
        contractMonth,
        strike,
        fromDate,
        todayStart,
        historicalDataArray,
        duration,
        resolve,
        reject,
        resolved: false,
        timestamp: Date.now(),
      })

      // タイムアウト処理
      setTimeout(() => {
        const request = this.pendingRequests.get(requestId)
        if (request && !request.resolved) {
          request.resolved = true
          request.reject(new Error(`データ取得タイムアウト: ${contractMonth} Strike:${strike} (${duration})`))
          this.pendingRequests.delete(requestId)
        }
      }, 30000)

      console.log(`データ取得開始: ${contractMonth} Strike:${strike} (期間: ${duration}) (ReqID: ${requestId})`)
      this.ib.reqHistoricalData(
        requestId,
        optionContract,
        '',
        duration, // 動的に指定された期間
        BarSizeSetting.HOURS_FOUR,
        WhatToShow.MIDPOINT,
        1,
        1,
        false
      )
    })
  }

  // 便利メソッド群
  async fetchVixOptionBars1Day(contractMonth: string, strike: number, fromDate?: Date): Promise<OptionClosePrice> {
    return this.fetchVixOptionBars(contractMonth, strike, 1, fromDate)
  }

  async fetchVixOptionBars7Days(contractMonth: string, strike: number, fromDate?: Date): Promise<OptionClosePrice> {
    return this.fetchVixOptionBars(contractMonth, strike, 7, fromDate)
  }

  async fetchVixOptionBars30Days(contractMonth: string, strike: number, fromDate?: Date): Promise<OptionClosePrice> {
    return this.fetchVixOptionBars(contractMonth, strike, 30, fromDate)
  }

  async fetchVixOptionBars360Days(contractMonth: string, strike: number, fromDate?: Date): Promise<OptionClosePrice> {
    return this.fetchVixOptionBars(contractMonth, strike, 360, fromDate)
  }

  // 複数のリクエストを並行して取得する（日数指定対応）
  async fetchMultipleVixOptionBars(
    requests: Array<{
      contractMonth: string
      strike: number
      durationDays?: number
      fromDate?: Date
    }>
  ): Promise<OptionClosePrice[]> {
    await this.connect()

    console.log(`${requests.length}件のVIXオプションデータ取得を開始`)

    // デフォルト値の設定
    const normalizedRequests = requests.map((req) => ({
      ...req,
      durationDays: req.durationDays || 360,
    }))

    // 同時実行数を制限（IBの制限を考慮）
    const concurrencyLimit = 3
    const results: OptionClosePrice[] = []

    for (let i = 0; i < normalizedRequests.length; i += concurrencyLimit) {
      const batch = normalizedRequests.slice(i, i + concurrencyLimit)
      const batchPromises = batch.map((req) =>
        this.fetchVixOptionBars(req.contractMonth, req.strike, req.durationDays!, req.fromDate)
      )

      try {
        const batchResults = await Promise.all(batchPromises)
        results.push(...batchResults)
        console.log(`バッチ ${Math.floor(i / concurrencyLimit) + 1} 完了 (${batchResults.length}件)`)

        // バッチ間で少し待機（レート制限対策）
        if (i + concurrencyLimit < normalizedRequests.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      } catch (error) {
        console.error(`バッチ処理エラー:`, error)
        throw error
      }
    }

    console.log(`全${results.length}件のデータ取得完了`)
    return results
  }

  public async getAvailableExpirations(): Promise<string[]> {
    await this.connect()

    return new Promise<string[]>((resolve, reject) => {
      const reqId = this.getNextRequestId()
      const expirations = new Set<string>()

      this.pendingRequests.set(reqId, {
        expirations,
        resolve: (result: string[]) => resolve(result),
        reject,
        resolved: false,
        timestamp: Date.now(),
      })

      const timeoutId = setTimeout(() => {
        const request = this.pendingRequests.get(reqId)
        if (request && !request.resolved) {
          request.resolved = true
          let uniqueExpirations = Array.from(expirations)
            .map((expiry) => expiry.split(' ')[0])
            .sort()
          uniqueExpirations = this.filterSecondTuesday(uniqueExpirations)
          console.log(`満期日取得完了 (タイムアウト): ${uniqueExpirations.length}件`)
          resolve(uniqueExpirations)
          this.pendingRequests.delete(reqId)
        }
      }, 10000)

      const vixContract: Contract = {
        symbol: 'VIX',
        secType: SecType.OPT,
        exchange: 'SMART',
        currency: 'USD',
      }

      console.log(`満期日取得リクエスト送信 (ReqID: ${reqId})`)
      this.ib.reqContractDetails(reqId, vixContract)
    })
  }

  public isConnected(): boolean {
    return this.connected
  }

  public getConnectionInfo() {
    return {
      host: this.host,
      port: this.port,
      clientId: this.clientId,
      connected: this.connected,
      pendingRequests: this.pendingRequests.size,
    }
  }

  public getPendingRequestsStatus() {
    const requests = Array.from(this.pendingRequests.entries()).map(([id, req]) => ({
      requestId: id,
      type: req.contractMonth ? 'historicalData' : 'contractDetails',
      contract: req.contractMonth || 'N/A',
      strike: req.strike || 'N/A',
      duration: req.duration || 'N/A',
      elapsed: Date.now() - req.timestamp,
    }))

    return {
      count: requests.length,
      requests,
    }
  }

  filterSecondTuesday(expirations: string[]): string[] {
    return expirations.filter((expiry) => {
      const year = parseInt(expiry.slice(0, 4), 10)
      const month = parseInt(expiry.slice(4, 6), 10) - 1
      const day = parseInt(expiry.slice(6, 8), 10)

      const date = new Date(year, month, day)

      if (date.getDay() !== 2) return false

      const firstDayOfMonth = new Date(year, month, 1).getDay()
      const firstTuesday = 1 + ((2 - firstDayOfMonth + 7) % 7)
      const secondTuesday = firstTuesday + 7
      const thirdTuesday = secondTuesday + 7

      return day === thirdTuesday
    })
  }

  public async cleanup(): Promise<void> {
    console.log('IBサービスをクリーンアップ中...')
    await this.disconnect()
  }
}
