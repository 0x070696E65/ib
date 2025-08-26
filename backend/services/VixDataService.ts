// services/VixDataService.ts
import { OptionClosePriceModel } from '../models/OptionClosePrice'
import { VixExpirationModel, ExpirationCacheStateModel } from '../models/VixExpiration'
import { IbServiceManager } from './ibService'

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

export class VixDataService {
  private ibService = IbServiceManager.getInstance()

  // 満期日の取得・保存
  async getAndSaveExpirations(): Promise<string[]> {
    const cache = await ExpirationCacheStateModel.findOne()
    const now = new Date()

    // 28日以内ならキャッシュ利用
    if (cache && now.getTime() - cache.lastUpdated.getTime() < 28 * 24 * 60 * 60 * 1000) {
      console.log('キャッシュから満期日を取得')
      const cachedExpirations = await VixExpirationModel.find().sort({ expiration: 1 })
      return cachedExpirations.map((e) => e.expiration)
    }

    console.log('IBから満期日を取得中...')
    const expirations = await this.ibService.getAvailableExpirations()

    // DB更新
    for (const exp of expirations) {
      await VixExpirationModel.updateOne({ expiration: exp }, { $set: { expiration: exp } }, { upsert: true })
    }

    // キャッシュ更新
    await ExpirationCacheStateModel.updateOne({}, { lastUpdated: now }, { upsert: true })

    console.log(`満期日保存完了: ${expirations.length}件`)
    return expirations
  }

  // 単一の契約・ストライクでオプションデータを取得・保存
  async fetchAndSaveOptionData(expiration: string, strike: number): Promise<FetchProgress> {
    try {
      // 最新データの日付を取得
      const latestRecord = await OptionClosePriceModel.findOne({
        contract: expiration,
        strike,
      }).sort({ date: -1 })

      const latestDate = latestRecord?.date

      const newOptionData = await this.ibService.fetchVixOptionBars(expiration, strike, latestDate)

      // 日次データの重複除去
      const dailyDataMap = new Map<string, (typeof newOptionData.data)[0]>()
      newOptionData.data.forEach((bar) => {
        const dateKey = bar.date.toISOString().slice(0, 10)
        if (!dailyDataMap.has(dateKey) || bar.date > dailyDataMap.get(dateKey)!.date) {
          dailyDataMap.set(dateKey, bar)
        }
      })

      // DB保存
      for (const bar of dailyDataMap.values()) {
        await OptionClosePriceModel.updateOne(
          { contract: expiration, strike, date: bar.date },
          { $set: { close: bar.close } },
          { upsert: true }
        )
      }

      return {
        expiration,
        strike,
        status: 'success',
        dataCount: dailyDataMap.size,
      }
    } catch (error) {
      return {
        expiration,
        strike,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  // 全データ一括取得（メイン処理）
  async fetchAllVixData(strikes: number[] = [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]): Promise<FetchSummary> {
    const startTime = Date.now()
    console.log('VIXデータ一括取得開始')

    // 満期日取得
    const expirations = await this.getAndSaveExpirations()

    const details: FetchProgress[] = []
    let successCount = 0
    let errorCount = 0

    // 各満期日×ストライクの処理
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

        // 進捗報告
        if (details.length % 5 === 0) {
          console.log(`進捗: ${details.length}/${expirations.length * strikes.length}`)
        }
      }
    }

    const duration = Date.now() - startTime

    const summary: FetchSummary = {
      duration: `${(duration / 1000).toFixed(1)}秒`,
      expirations: expirations.length,
      totalRequests: details.length,
      successCount,
      errorCount,
      message: 'VIXオプションデータの一括取得・保存が完了しました',
      details,
    }

    console.log('処理完了:', summary)
    return summary
  }

  // 特定の満期日・ストライクレンジでのテスト用メソッド
  async fetchTestData(expiration: string, strikes: number[] = [18, 19, 20]): Promise<FetchSummary> {
    const startTime = Date.now()
    console.log(`テストデータ取得開始: ${expiration}`)

    const details: FetchProgress[] = []
    let successCount = 0
    let errorCount = 0

    for (const strike of strikes) {
      const result = await this.fetchAndSaveOptionData(expiration, strike)
      details.push(result)

      if (result.status === 'success') {
        successCount++
      } else {
        errorCount++
      }
    }

    const duration = Date.now() - startTime

    return {
      duration: `${(duration / 1000).toFixed(1)}秒`,
      expirations: 1,
      totalRequests: details.length,
      successCount,
      errorCount,
      message: `テストデータ取得完了: ${expiration}`,
      details,
    }
  }
}
