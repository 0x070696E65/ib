// backend/models/PriceDataCache.ts
import { Schema, model, Document } from 'mongoose'

interface IPriceDataCache extends Document {
  id: string
  fetchDate: Date
  expirations: string[]
  strikeRange: {
    min: number
    max: number
    step: number
  }
  optionPrices: Record<string, any[]> // OptionPrice[]
  futurePrices: Record<string, any> // FuturePrice
  strategies: any[] // StrategyPair[]
  metadata: {
    totalOptions: number
    totalStrategies: number
    fetchDuration: number // 取得時間（秒）
    priceSource: 'IB_API' | 'CACHED'
  }
}

const PriceDataCacheSchema = new Schema<IPriceDataCache>(
  {
    fetchDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    expirations: [
      {
        type: String,
        required: true,
      },
    ],
    strikeRange: {
      min: { type: Number, required: true },
      max: { type: Number, required: true },
      step: { type: Number, required: true },
    },
    optionPrices: {
      type: Map,
      of: Schema.Types.Mixed,
      required: true,
    },
    futurePrices: {
      type: Map,
      of: Schema.Types.Mixed,
      required: true,
    },
    strategies: [
      {
        type: Schema.Types.Mixed,
      },
    ],
    metadata: {
      totalOptions: { type: Number, required: true },
      totalStrategies: { type: Number, required: true },
      fetchDuration: { type: Number, required: true },
      priceSource: {
        type: String,
        enum: ['IB_API', 'CACHED'],
        required: true,
      },
    },
  },
  {
    timestamps: true,
  }
)

// インデックス設定
PriceDataCacheSchema.index({ fetchDate: -1 }) // 最新データ取得用
PriceDataCacheSchema.index({
  'strikeRange.min': 1,
  'strikeRange.max': 1,
  'strikeRange.step': 1,
}) // ストライク範囲検索用

export const PriceDataCache = model<IPriceDataCache>('PriceDataCache', PriceDataCacheSchema)
