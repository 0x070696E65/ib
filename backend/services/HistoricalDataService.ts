// services/HistoricalDataService.ts
import { EventName, SecType, OptionType, BarSizeSetting, WhatToShow, Contract } from '@stoqey/ib'
import { DateTime } from 'luxon'
import { IbService } from './IbService'
import { OptionClosePrice, FutureClosePrice } from './types'

export class HistoricalDataService {
  constructor(private ibService: IbService) {
    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    this.ibService.getIbApi().on(EventName.historicalData, this.onHistoricalData.bind(this))
  }

  private onHistoricalData(
    tickerId: number,
    bar: string,
    open: number,
    high: number,
    low: number,
    close: number
  ): void {
    const request = this.ibService.getPendingRequest(tickerId)
    if (!request) return

    if (typeof bar === 'string' && bar.startsWith('finished-')) {
      if (!request.resolved) {
        request.resolved = true

        // 先物とオプションで異なるレスポンス形式
        if (request.futureType) {
          request.resolve({
            contract: request.contractMonth,
            data: request.historicalDataArray,
            requestedDuration: request.duration,
            actualDataPoints: request.historicalDataArray.length,
          })
        } else {
          // 既存のオプション用レスポンス
          request.resolve({
            contract: request.contractMonth,
            strike: request.strike,
            data: request.historicalDataArray,
            requestedDuration: request.duration,
            actualDataPoints: request.historicalDataArray.length,
          })
        }
        this.ibService.removePendingRequest(tickerId)
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
    await this.ibService.connect()

    return new Promise((resolve, reject) => {
      const requestId = this.ibService.getNextRequestId()
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
      this.ibService.addPendingRequest(requestId, {
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
        const request = this.ibService.getPendingRequest(requestId)
        if (request && !request.resolved) {
          request.resolved = true
          request.reject(new Error(`データ取得タイムアウト: ${contractMonth} Strike:${strike} (${duration})`))
          this.ibService.removePendingRequest(requestId)
        }
      }, 30000)

      console.log(`データ取得開始: ${contractMonth} Strike:${strike} (期間: ${duration}) (ReqID: ${requestId})`)
      this.ibService.getIbApi().reqHistoricalData(
        requestId,
        optionContract,
        '',
        duration, // 動的に指定された期間
        BarSizeSetting.HOURS_EIGHT,
        WhatToShow.MIDPOINT,
        1,
        1,
        false
      )
    })
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
    await this.ibService.connect()

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

  /**
   * VIX先物の履歴データを取得（日足終値）
   * @param contractMonth 満期月 (例: '202501')
   * @param durationDays 取得日数 (初回: 720日, 更新: 30日)
   * @param fromDate 開始日 (指定された場合は追加フィルタリング)
   */
  async fetchVixFutureBars(
    contractMonth: string,
    durationDays: number = 720,
    fromDate?: Date
  ): Promise<FutureClosePrice> {
    await this.ibService.connect()

    return new Promise((resolve, reject) => {
      const requestId = this.ibService.getNextRequestId()
      const futureContract: Contract = {
        symbol: 'VIX',
        secType: SecType.FUT,
        exchange: 'CFE',
        currency: 'USD',
        lastTradeDateOrContractMonth: contractMonth,
        tradingClass: 'VX',
        multiplier: 1000,
      }

      const historicalDataArray: { date: Date; close: number }[] = []
      const todayStart = DateTime.now().setZone('US/Central').startOf('day').toJSDate()
      const duration = `${durationDays} D`

      // リクエスト情報を保存
      this.ibService.addPendingRequest(requestId, {
        contractMonth,
        futureType: true, // 先物フラグ
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
        const request = this.ibService.getPendingRequest(requestId)
        if (request && !request.resolved) {
          request.resolved = true
          request.reject(new Error(`先物データ取得タイムアウト: ${contractMonth} (${duration})`))
          this.ibService.removePendingRequest(requestId)
        }
      }, 30000)

      console.log(`VIX先物データ取得開始: ${contractMonth} (期間: ${duration}) (ReqID: ${requestId})`)
      this.ibService.getIbApi().reqHistoricalData(
        requestId,
        futureContract,
        '',
        duration,
        BarSizeSetting.HOURS_EIGHT,
        WhatToShow.TRADES, // 実際の取引価格（終値）
        1,
        1,
        false
      )
    })
  }

  /**
   * 複数のVIX先物データを順次取得
   * @param contractMonths 満期月の配列 (例: ['202501', '202502'])
   * @param durationDays 取得日数 (デフォルト: 720日)
   */
  async fetchMultipleVixFutureBars(contractMonths: string[], durationDays: number = 720): Promise<FutureClosePrice[]> {
    await this.ibService.connect()

    console.log(`${contractMonths.length}件のVIX先物データ取得を開始`)
    const results: FutureClosePrice[] = []

    // 順次処理でレート制限を回避
    for (const contractMonth of contractMonths) {
      try {
        const result = await this.fetchVixFutureBars(contractMonth, durationDays, undefined)
        results.push(result)
        console.log(`先物データ取得完了: ${contractMonth} (${result.actualDataPoints}件)`)

        // 次のリクエスト前に少し待機
        await new Promise((resolve) => setTimeout(resolve, 1500))
      } catch (error) {
        console.error(`先物データ取得エラー: ${contractMonth}`, error)
        // エラーがあっても他の契約は続行
      }
    }

    console.log(`VIX先物データ取得完了: ${results.length}件`)
    return results
  }
}
