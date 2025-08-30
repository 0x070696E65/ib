// services/ExpirationService.ts
import { createIbServices } from './ib-service'
import {
  VixExpirationModel,
  ExpirationCacheStateModel,
  VixFutureExpirationModel,
  FutureExpirationCacheStateModel,
} from '../models/VixExpiration'

export class ExpirationService {
  private static instance: ExpirationService
  private ibServices = createIbServices()

  static getInstance(): ExpirationService {
    if (!this.instance) {
      this.instance = new ExpirationService()
    }
    return this.instance
  }

  /**
   * 満期日を取得（キャッシュ優先）
   * 28日以内のデータがあればMongoDB、なければIBから取得
   */
  async getExpirations(): Promise<string[]> {
    try {
      const cache = await ExpirationCacheStateModel.findOne()
      const now = new Date()

      // 28日以内ならキャッシュ利用
      if (cache && this.isWithinCacheWindow(cache.lastUpdated, now)) {
        console.log('満期日をキャッシュから取得')
        const expirations = await VixExpirationModel.find().sort({ expiration: 1 })
        return expirations.map((e) => e.expiration)
      }

      console.log('満期日をIBから新規取得')
      // IBから取得
      const expirations = await this.ibServices.contracts.getAvailableExpirations()

      if (expirations.length === 0) {
        // フォールバック: 既存のキャッシュがあれば使用
        if (cache) {
          console.log('IB取得失敗、既存キャッシュを使用')
          const existingExpirations = await VixExpirationModel.find().sort({ expiration: 1 })
          return existingExpirations.map((e) => e.expiration)
        }
        throw new Error('満期日を取得できませんでした')
      }

      // MongoDB更新
      await this.updateExpirationsInDB(expirations)

      // キャッシュ状態更新
      await this.updateCacheState(cache, now)

      return expirations
    } catch (error) {
      console.error('満期日取得エラー:', error)

      // エラー時のフォールバック
      const existingExpirations = await VixExpirationModel.find().sort({ expiration: 1 })
      if (existingExpirations.length > 0) {
        console.log('エラー発生、既存の満期日を使用:', existingExpirations.length, '件')
        return existingExpirations.map((e) => e.expiration)
      }

      throw error
    }
  }

  async getFutureExpirations(): Promise<string[]> {
    try {
      const cache = await FutureExpirationCacheStateModel.findOne()
      const now = new Date()

      // 28日以内ならキャッシュ利用
      if (cache && this.isWithinCacheWindow(cache.lastUpdated, now)) {
        console.log('先物満期日をキャッシュから取得')
        const expirations = await VixFutureExpirationModel.find().sort({ expiration: 1 })
        return expirations.map((e) => e.expiration)
      }

      console.log('先物満期日をIBから新規取得')
      // IBから取得
      const expirations = await this.ibServices.contracts.getAvailableFutureExpirations()

      if (expirations.length === 0) {
        // フォールバック
        if (cache) {
          console.log('IB取得失敗、既存の先物キャッシュを使用')
          const existingExpirations = await VixFutureExpirationModel.find().sort({ expiration: 1 })
          return existingExpirations.map((e) => e.expiration)
        }
        throw new Error('先物満期日を取得できませんでした')
      }

      // MongoDB更新
      await this.updateFutureExpirationsInDB(expirations)

      // キャッシュ状態更新
      await this.updateFutureCacheState(cache, now)

      return expirations
    } catch (error) {
      console.error('先物満期日取得エラー:', error)

      // エラー時のフォールバック
      const existingExpirations = await VixFutureExpirationModel.find().sort({ expiration: 1 })
      if (existingExpirations.length > 0) {
        console.log('エラー発生、既存の先物満期日を使用:', existingExpirations.length, '件')
        return existingExpirations.map((e) => e.expiration)
      }

      throw error
    }
  }

  private async updateFutureExpirationsInDB(expirations: string[]): Promise<void> {
    console.log(`先物満期日をDBに保存: ${expirations.length}件`)

    const operations = expirations.map((exp) => ({
      updateOne: {
        filter: { expiration: exp },
        update: { $set: { expiration: exp } },
        upsert: true,
      },
    }))

    if (operations.length > 0) {
      await VixFutureExpirationModel.bulkWrite(operations, { ordered: false })
    }
  }

  private async updateFutureCacheState(cache: any, now: Date): Promise<void> {
    if (cache) {
      cache.lastUpdated = now
      await cache.save()
    } else {
      await FutureExpirationCacheStateModel.create({ lastUpdated: now })
    }
    console.log('先物キャッシュ状態を更新')
  }

  /**
   * キャッシュ期間内かチェック（28日）
   */
  private isWithinCacheWindow(lastUpdated: Date, now: Date): boolean {
    const cacheWindowMs = 28 * 24 * 60 * 60 * 1000 // 28日
    return now.getTime() - lastUpdated.getTime() < cacheWindowMs
  }

  /**
   * 満期日をMongoDBに保存（重複は無視）
   */
  private async updateExpirationsInDB(expirations: string[]): Promise<void> {
    console.log(`満期日をDBに保存: ${expirations.length}件`)

    const operations = expirations.map((exp) => ({
      updateOne: {
        filter: { expiration: exp },
        update: { $set: { expiration: exp } },
        upsert: true,
      },
    }))

    if (operations.length > 0) {
      await VixExpirationModel.bulkWrite(operations, { ordered: false })
    }
  }

  /**
   * キャッシュ状態を更新
   */
  private async updateCacheState(cache: any, now: Date): Promise<void> {
    if (cache) {
      cache.lastUpdated = now
      await cache.save()
    } else {
      await ExpirationCacheStateModel.create({ lastUpdated: now })
    }
    console.log('キャッシュ状態を更新')
  }

  /**
   * キャッシュを強制更新
   */
  async forceRefresh(): Promise<string[]> {
    console.log('満期日キャッシュを強制更新')

    // キャッシュ状態をリセット
    await ExpirationCacheStateModel.deleteMany({})

    return await this.getExpirations()
  }

  /**
   * キャッシュ状態を取得
   */
  async getCacheStatus(): Promise<{
    hasCacheState: boolean
    lastUpdated?: Date
    daysSinceUpdate?: number
    totalExpirations: number
  }> {
    const cache = await ExpirationCacheStateModel.findOne()
    const totalExpirations = await VixExpirationModel.countDocuments()

    if (!cache) {
      return {
        hasCacheState: false,
        totalExpirations,
      }
    }

    const now = new Date()
    const daysSinceUpdate = Math.floor((now.getTime() - cache.lastUpdated.getTime()) / (1000 * 60 * 60 * 24))

    return {
      hasCacheState: true,
      lastUpdated: cache.lastUpdated,
      daysSinceUpdate,
      totalExpirations,
    }
  }
}
