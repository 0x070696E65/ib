// backend/models/TradeBundle.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface ITradeBundle extends Document {
  bundleId: string // UUID
  name: string
  tag: 'PP' // PPタグのみバンドル化

  // 基本情報
  symbol: string
  expiry: string
  createdDate: Date

  // バンドル内の取引
  executionIds: string[]

  // 集計データ
  totalQuantity: number
  totalPnL: number // 実現損益のみ
  averagePrice: number

  // 状態
  status: 'OPEN' | 'CLOSED' | 'EXPIRED'

  createdAt: Date
  updatedAt: Date
}

const TradeBundleSchema = new Schema<ITradeBundle>(
  {
    bundleId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    tag: { type: String, required: true, enum: ['PP'] },

    symbol: { type: String, required: true, index: true },
    expiry: { type: String, required: true, index: true },
    createdDate: { type: Date, required: true },

    executionIds: [{ type: String, required: true }],

    totalQuantity: { type: Number, default: 0 },
    totalPnL: { type: Number, default: 0 },
    averagePrice: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ['OPEN', 'CLOSED', 'EXPIRED'],
      default: 'OPEN',
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'trade_bundles',
  }
)

export const TradeBundle = mongoose.model<ITradeBundle>('TradeBundle', TradeBundleSchema, 'trade_bundles')
