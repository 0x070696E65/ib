// services/VixDataService.ts (シンプル版)
import { IbService, OptionClosePrice } from './IbService'
import { OptionClosePriceModel } from '../models/OptionClosePrice'
import { ExpirationService } from './ExpirationService'

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
    duration30D: number
    duration90D: number
    duration360D: number
  }
}

export class VixDataService {
  private ibService = IbService.getInstance()
  private expirationService = ExpirationService.getInstance()

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
   * スマート期間決定を使用した一括データ取得（シンプル版）
   */
  async fetchAllVixData(strikes: number[] = [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]): Promise<FetchSummary> {
    const startTime = Date.now()
    console.log('VIXデータ一括取得開始 (シンプル版)')

    try {
      // 1. 満期日取得
      console.log('満期日を取得中...')
      const expirations = await this.getAndSaveExpirations()

      if (!expirations || expirations.length === 0) {
        throw new Error('満期日が取得できませんでした。IBが正常に動作していることを確認してください。')
      }

      console.log(`取得した満期日: ${expirations.length}件`)

      // 2. 各契約・ストライクの最適化情報を準備
      console.log('最適化情報を準備中...')
      const optimizationStats = {
        duration30D: 0,
        duration90D: 0,
        duration360D: 0,
      }

      const requests: Array<{
        contractMonth: string
        strike: number
        durationDays: number
        fromDate?: Date
        optimizationReason: string
      }> = []

      // 最適化情報を順次取得（シンプルに）
      for (const expiration of expirations) {
        for (const strike of strikes) {
          const lastMarketDate = await this.getLastMarketDate(expiration, strike)
          const optimization = this.calculateOptimalDuration(lastMarketDate)

          // 統計を更新
          const key = `duration${optimization.durationDays}D` as keyof typeof optimizationStats
          if (key in optimizationStats) {
            optimizationStats[key]++
          }

          // リクエスト配列に追加
          requests.push({
            contractMonth: expiration, // ibServiceが期待するフィールド名
            strike: strike,
            durationDays: optimization.durationDays,
            fromDate: lastMarketDate || undefined,
            optimizationReason: optimization.reason,
          })
        }
      }

      console.log(`総リクエスト数: ${requests.length}件`)
      console.log('期間別最適化統計:')
      console.log(`  30日: ${optimizationStats.duration30D}件`)
      console.log(`  90日: ${optimizationStats.duration90D}件`)
      console.log(`  360日: ${optimizationStats.duration360D}件`)

      // 3. バッチ処理でデータ取得
      console.log('データ取得開始...')
      const optionDataResults = await this.ibService.fetchMultipleVixOptionBars(requests)

      // 4. データ保存
      console.log('取得したデータを保存中...')
      const details = await this.saveResults(optionDataResults, requests)

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
   * 取得結果をMongoDBに保存（シンプル版）
   */
  private async saveResults(
    optionDataResults: OptionClosePrice[],
    originalRequests: Array<{
      contractMonth: string
      strike: number
      durationDays: number
      optimizationReason: string
    }>
  ): Promise<FetchProgress[]> {
    const details: FetchProgress[] = []

    for (const result of optionDataResults) {
      const saveStartTime = Date.now()
      const originalRequest = originalRequests.find(
        (req) => req.contractMonth === result.contract && req.strike === result.strike
      )

      try {
        // MongoDBに保存
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

        details.push({
          expiration: result.contract,
          strike: result.strike,
          status: 'success',
          dataCount: result.data.length,
          duration: `${saveDuration}ms`,
          durationDays: originalRequest?.durationDays,
          optimizationReason: originalRequest?.optimizationReason,
        })

        console.log(`保存完了: ${result.contract} Strike${result.strike} - ${result.data.length}件`)
      } catch (error) {
        const saveDuration = Date.now() - saveStartTime

        console.error(`保存エラー ${result.contract} Strike${result.strike}:`, error)

        details.push({
          expiration: result.contract,
          strike: result.strike,
          status: 'error',
          error: String(error),
          duration: `${saveDuration}ms`,
          durationDays: originalRequest?.durationDays,
          optimizationReason: originalRequest?.optimizationReason,
        })
      }
    }

    return details
  }

  /**
   * 満期日取得
   */
  private async getAndSaveExpirations(): Promise<string[]> {
    return await this.expirationService.getExpirations()
  }

  /**
   * 接続状況取得
   */
  getConnectionStatus() {
    return {
      ...this.ibService.getConnectionInfo(),
      ...this.ibService.getPendingRequestsStatus(),
    }
  }
}
