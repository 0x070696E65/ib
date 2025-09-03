// backend/services/PriceCacheService.ts
import { PriceDataCache } from '../../models/PriceDataCache'

export interface CacheRequest {
  expirations: string[]
  strikeMin: number
  strikeMax: number
  stepSize: number
}

export interface CacheData {
  id: string
  fetchDate: Date
  optionPrices: Record<string, any[]>
  futurePrices: Record<string, any>
  strategies: any[]
  metadata: {
    totalOptions: number
    totalStrategies: number
    fetchDuration: number
    priceSource: 'IB_API' | 'CACHED'
  }
}

export class PriceCacheService {
  /**
   * 新しい価格データをキャッシュに保存（既存データ全削除）
   */
  async saveToCache(
    request: CacheRequest,
    optionPrices: Record<string, any[]>,
    futurePrices: Record<string, any>,
    strategies: any[],
    fetchDuration: number
  ): Promise<string> {
    // 既存のキャッシュデータを全削除
    await PriceDataCache.deleteMany({})
    console.log('既存キャッシュデータを削除しました')

    const totalOptions = Object.values(optionPrices).reduce((sum, prices) => sum + prices.length, 0)

    const cacheData = new PriceDataCache({
      fetchDate: new Date(),
      expirations: request.expirations,
      strikeRange: {
        min: request.strikeMin,
        max: request.strikeMax,
        step: request.stepSize,
      },
      optionPrices,
      futurePrices,
      strategies,
      metadata: {
        totalOptions,
        totalStrategies: strategies.length,
        fetchDuration,
        priceSource: 'IB_API',
      },
    })

    const saved = (await cacheData.save()) as any
    console.log(`新しいキャッシュデータを保存しました: ${saved._id}`)

    return saved._id.toString()
  }

  /**
   * 最新のキャッシュデータを取得
   */
  async getLatestCache(): Promise<CacheData | null> {
    const cache = (await PriceDataCache.findOne().sort({ fetchDate: -1 })) as any

    if (!cache) return null

    return {
      id: cache._id.toString(),
      fetchDate: cache.fetchDate,
      optionPrices: Object.fromEntries(cache.optionPrices),
      futurePrices: Object.fromEntries(cache.futurePrices),
      strategies: cache.strategies,
      metadata: {
        ...cache.metadata,
        priceSource: 'CACHED',
      },
    }
  }

  /**
   * キャッシュの概要情報を取得
   */
  async getCacheSummary(): Promise<{
    hasCache: boolean
    fetchDate?: Date
    strikeRange?: { min: number; max: number; step: number }
    expirations?: string[]
    totalOptions?: number
    totalStrategies?: number
    fetchDuration?: number
    ageInHours?: number
  }> {
    const cache = await PriceDataCache.findOne().sort({ fetchDate: -1 })

    if (!cache) {
      return { hasCache: false }
    }

    const ageInHours = (Date.now() - cache.fetchDate.getTime()) / (1000 * 60 * 60)

    return {
      hasCache: true,
      fetchDate: cache.fetchDate,
      strikeRange: cache.strikeRange,
      expirations: cache.expirations,
      totalOptions: cache.metadata.totalOptions,
      totalStrategies: cache.metadata.totalStrategies,
      fetchDuration: cache.metadata.fetchDuration,
      ageInHours,
    }
  }

  /**
   * 特定の条件でキャッシュが利用可能かチェック
   */
  async isCacheValidFor(request: CacheRequest): Promise<boolean> {
    const cache = await PriceDataCache.findOne().sort({ fetchDate: -1 })

    if (!cache) return false

    // ストライク範囲とステップサイズが一致するかチェック
    const rangeMatches =
      cache.strikeRange.min <= request.strikeMin &&
      cache.strikeRange.max >= request.strikeMax &&
      cache.strikeRange.step === request.stepSize

    // 満期日が全て含まれているかチェック
    const expirationsMatch = request.expirations.every((exp) => cache.expirations.includes(exp))

    // 24時間以内のデータかチェック
    const ageInHours = (Date.now() - cache.fetchDate.getTime()) / (1000 * 60 * 60)
    const isFresh = ageInHours < 24

    return rangeMatches && expirationsMatch && isFresh
  }

  /**
   * キャッシュデータを削除
   */
  async clearCache(): Promise<void> {
    await PriceDataCache.deleteMany({})
    console.log('全キャッシュデータを削除しました')
  }
}
