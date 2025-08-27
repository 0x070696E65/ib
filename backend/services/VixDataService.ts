// services/VixDataService.ts (スマート期間決定版)
import { IbServiceManager, OptionClosePrice } from './ibService'
import { OptionClosePriceModel } from '../models/OptionClosePrice'

export interface FetchProgress {
  expiration: string
  strike: number
  status: 'success' | 'error'
  dataCount?: number
  error?: string
  duration?: string
  durationDays?: number
  optimizationReason?: string
}

export interface FetchSummary {
  duration: string
  expirations: number
  totalRequests: number
  successCount: number
  errorCount: number
  message: string
  details: FetchProgress[]
  optimizationStats?: {
    duration1D: number
    duration7D: number
    duration30D: number
    duration90D: number
    duration360D: number
  }
}

export class VixDataService {
  private ibService = IbServiceManager.getInstance()

  /**
   * 各契約・ストライクの最終市場データ日を取得
   */
  private async getLastMarketDate(contract: string, strike: number): Promise<Date | null> {
    try {
      const lastRecord = await OptionClosePriceModel.findOne({ contract, strike })
        .sort({ date: -1 })
        .select('date')
        .lean()

      return lastRecord?.date || null
    } catch (error) {
      console.warn(`最終データ日取得エラー ${contract} Strike${strike}:`, error)
      return null
    }
  }

  /**
   * 最終データ日に基づいて最適な取得期間を決定
   */
  private calculateOptimalDuration(lastMarketDate: Date | null): {
    durationDays: number
    reason: string
  } {
    if (!lastMarketDate) {
      return {
        durationDays: 360,
        reason: '初回取得 - 全履歴が必要',
      }
    }

    const now = new Date()
    const daysSince = Math.ceil((now.getTime() - lastMarketDate.getTime()) / (1000 * 60 * 60 * 24))

    if (daysSince <= 30) {
      return {
        durationDays: 30,
        reason: `${daysSince}日前のデータ - 30D最適化`,
      }
    } else if (daysSince <= 90) {
      return {
        durationDays: 90,
        reason: `${daysSince}日前のデータ - 90D中期取得`,
      }
    } else {
      return {
        durationDays: 360,
        reason: `${daysSince}日前のデータ - 360D再構築`,
      }
    }
  }

  /**
   * スマート期間決定を使用した一括データ取得
   */
  async fetchAllVixData(strikes: number[] = [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]): Promise<FetchSummary> {
    const startTime = Date.now()
    console.log('VIXデータ一括取得開始 (スマート期間決定版)')

    try {
      // 満期日取得
      console.log('満期日を取得中...')
      const expirations = await this.getAndSaveExpirations()
      console.log(`取得した満期日: ${expirations.length}件`)

      // 各契約・ストライクの最終データ日を並行取得
      console.log('最終データ日を確認中...')
      const optimizationStats = {
        duration1D: 0,
        duration7D: 0,
        duration30D: 0,
        duration90D: 0,
        duration360D: 0,
      }

      const requests: string | any[] = []
      const lastDataPromises = []

      for (const expiration of expirations) {
        for (const strike of strikes) {
          lastDataPromises.push(
            this.getLastMarketDate(expiration, strike).then((lastMarketDate) => {
              const optimization = this.calculateOptimalDuration(lastMarketDate)

              // 統計を更新
              const key = `duration${optimization.durationDays}D` as keyof typeof optimizationStats
              if (key in optimizationStats) {
                optimizationStats[key]++
              }

              return {
                contractMonth: expiration,
                strike: strike,
                durationDays: optimization.durationDays,
                fromDate: lastMarketDate,
                optimizationReason: optimization.reason,
              }
            })
          )
        }
      }

      const optimizedRequests = await Promise.all(lastDataPromises)
      //requests.push(...optimizedRequests)

      console.log(`総リクエスト数: ${requests.length}件`)
      console.log('期間別最適化統計:')
      console.log(`  30日: ${optimizationStats.duration30D}件 (高速)`)
      console.log(`  90日: ${optimizationStats.duration90D}件 (中期)`)
      console.log(`  360日: ${optimizationStats.duration360D}件 (再構築)`)

      // バッチ処理でデータ取得
      console.log('最適化バッチ処理でデータ取得開始...')
      const optionDataResults = await this.ibService.fetchMultipleVixOptionBars(requests)

      // データ保存と結果集計
      console.log('取得したデータを保存中...')
      const details = await this.processAndSaveResults(optionDataResults, optimizedRequests)

      const duration = Date.now() - startTime
      const successCount = details.filter((d) => d.status === 'success').length
      const errorCount = details.filter((d) => d.status === 'error').length

      const summary: FetchSummary = {
        duration: `${(duration / 1000).toFixed(1)}秒`,
        expirations: expirations.length,
        totalRequests: details.length,
        successCount,
        errorCount,
        message: 'VIXオプションデータの最適化一括取得・保存が完了しました',
        details,
        optimizationStats,
      }

      console.log('処理完了:', {
        duration: summary.duration,
        total: summary.totalRequests,
        success: successCount,
        error: errorCount,
        optimization: optimizationStats,
      })

      return summary
    } catch (error) {
      const duration = Date.now() - startTime
      console.error('一括取得でエラー発生:', error)

      return {
        duration: `${(duration / 1000).toFixed(1)}秒`,
        expirations: 0,
        totalRequests: 0,
        successCount: 0,
        errorCount: 1,
        message: `一括取得でエラーが発生しました: ${String(error)}`,
        details: [],
      }
    } finally {
      await this.ibService.cleanup()
    }
  }

  /**
   * バッチ処理結果を保存（最適化情報付き）
   */
  private async processAndSaveResults(
    optionDataResults: OptionClosePrice[],
    originalRequests: Array<{
      contractMonth: string
      strike: number
      durationDays: number
      optimizationReason: string
    }>
  ): Promise<FetchProgress[]> {
    const details: FetchProgress[] = []

    // 結果を並行処理で保存
    const savePromises = optionDataResults.map(async (result, index) => {
      const saveStartTime = Date.now()
      const originalRequest = originalRequests.find(
        (req) => req.contractMonth === result.contract && req.strike === result.strike
      )

      try {
        // 実際のデータベース保存処理
        if (result.data && result.data.length > 0) {
          const saveOperations = result.data.map((dataPoint) => ({
            updateOne: {
              filter: {
                contract: result.contract,
                strike: result.strike,
                date: dataPoint.date,
              },
              update: {
                $set: {
                  contract: result.contract,
                  strike: result.strike,
                  date: dataPoint.date,
                  close: dataPoint.close,
                },
              },
              upsert: true,
            },
          }))

          if (saveOperations.length > 0) {
            await OptionClosePriceModel.bulkWrite(saveOperations, { ordered: false })
          }
        }

        const saveDuration = Date.now() - saveStartTime

        return {
          expiration: result.contract,
          strike: result.strike,
          status: 'success' as const,
          dataCount: result.data.length,
          duration: `${saveDuration}ms`,
          durationDays: originalRequest?.durationDays,
          optimizationReason: originalRequest?.optimizationReason,
        }
      } catch (error) {
        const saveDuration = Date.now() - saveStartTime

        console.error(`保存エラー ${result.contract} Strike${result.strike}:`, error)

        return {
          expiration: result.contract,
          strike: result.strike,
          status: 'error' as const,
          error: String(error),
          duration: `${saveDuration}ms`,
          durationDays: originalRequest?.durationDays,
          optimizationReason: originalRequest?.optimizationReason,
        }
      }
    })

    // 保存処理も並行実行（同時実行数制限）
    const concurrencyLimit = 5
    for (let i = 0; i < savePromises.length; i += concurrencyLimit) {
      const batch = savePromises.slice(i, i + concurrencyLimit)
      const batchResults = await Promise.all(batch)
      details.push(...batchResults)

      console.log(`保存バッチ ${Math.floor(i / concurrencyLimit) + 1} 完了 (${batchResults.length}件)`)
    }

    return details
  }

  /**
   * フォールバック：従来の逐次処理版（固定360D）
   */
  async fetchAllVixDataSequential(
    strikes: number[] = [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]
  ): Promise<FetchSummary> {
    const startTime = Date.now()
    console.log('VIXデータ一括取得開始 (逐次処理版・固定360D)')

    try {
      const expirations = await this.getAndSaveExpirations()
      const details: FetchProgress[] = []
      let successCount = 0
      let errorCount = 0

      await this.ibService.connect()

      for (const expiration of expirations) {
        console.log(`満期日 ${expiration} の処理開始...`)

        for (const strike of strikes) {
          console.log(`${expiration} Strike${strike}: データ取得中...`)

          const result = await this.fetchAndSaveOptionData(expiration, strike)
          details.push(result)

          if (result.status === 'success') {
            console.log(`${expiration} Strike${strike}: ${result.dataCount}件保存`)
            successCount++
          } else {
            console.error(`${expiration} Strike${strike}: エラー`, result.error)
            errorCount++
          }

          if (details.length % 5 === 0) {
            console.log(`進捗: ${details.length}/${expirations.length * strikes.length}`)
          }
        }
      }

      const duration = Date.now() - startTime

      return {
        duration: `${(duration / 1000).toFixed(1)}秒`,
        expirations: expirations.length,
        totalRequests: details.length,
        successCount,
        errorCount,
        message: 'VIXオプションデータの一括取得・保存が完了しました（逐次処理）',
        details,
      }
    } finally {
      await this.ibService.cleanup()
    }
  }

  /**
   * 最適化統計の取得
   */
  async getOptimizationPreview(strikes: number[] = [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]): Promise<{
    totalContracts: number
    optimizationBreakdown: Record<string, number>
    estimatedSpeedup: string
  }> {
    console.log('最適化プレビューを生成中...')

    const expirations = await this.getAndSaveExpirations()
    const optimizationCounts = { '30D': 0, '90D': 0, '360D': 0 }

    const promises = []
    for (const expiration of expirations) {
      for (const strike of strikes) {
        promises.push(
          this.getLastMarketDate(expiration, strike).then((lastMarketDate) => {
            const optimization = this.calculateOptimalDuration(lastMarketDate)
            const key = `${optimization.durationDays}D` as keyof typeof optimizationCounts
            if (key in optimizationCounts) {
              optimizationCounts[key]++
            }
          })
        )
      }
    }

    await Promise.all(promises)

    const totalContracts = expirations.length * strikes.length
    const estimatedSpeedup = this.estimateSpeedup(optimizationCounts, totalContracts)

    return {
      totalContracts,
      optimizationBreakdown: optimizationCounts,
      estimatedSpeedup,
    }
  }

  private estimateSpeedup(counts: Record<string, number>, total: number): string {
    // テスト結果を基にした処理時間推定 (ms)
    const timings = { '30D': 661, '90D': 910, '360D': 804 }

    const optimizedTime =
      counts['30D'] * timings['30D'] + counts['90D'] * timings['90D'] + counts['360D'] * timings['360D']

    const originalTime = total * timings['360D'] // 従来は全て360D

    const improvement = (((originalTime - optimizedTime) / originalTime) * 100).toFixed(1)
    return `${improvement}% 高速化予想`
  }

  // 既存メソッド群
  private async getAndSaveExpirations(): Promise<string[]> {
    return await this.ibService.getAvailableExpirations()
  }

  private async fetchAndSaveOptionData(expiration: string, strike: number): Promise<FetchProgress> {
    const fetchStartTime = Date.now()

    try {
      const result = await this.ibService.fetchVixOptionBars(expiration, strike, 360) // 固定360D

      // データベース保存処理
      if (result.data && result.data.length > 0) {
        const saveOperations = result.data.map((dataPoint) => ({
          updateOne: {
            filter: {
              contract: result.contract,
              strike: result.strike,
              date: dataPoint.date,
            },
            update: {
              $set: {
                contract: result.contract,
                strike: result.strike,
                date: dataPoint.date,
                close: dataPoint.close,
              },
            },
            upsert: true,
          },
        }))

        await OptionClosePriceModel.bulkWrite(saveOperations, { ordered: false })
      }

      const duration = Date.now() - fetchStartTime

      return {
        expiration,
        strike,
        status: 'success',
        dataCount: result.data.length,
        duration: `${duration}ms`,
      }
    } catch (error) {
      const duration = Date.now() - fetchStartTime

      return {
        expiration,
        strike,
        status: 'error',
        error: String(error),
        duration: `${duration}ms`,
      }
    }
  }

  getConnectionStatus() {
    return {
      ...this.ibService.getConnectionInfo(),
      ...this.ibService.getPendingRequestsStatus(),
    }
  }
}
