// backend/models/TradeOrder.ts - orderID単位で集約した取引モデル
import mongoose, { Schema, Document } from 'mongoose'

export interface ITradeOrder extends Document {
  // 基本情報
  accountId: string
  symbol: string
  secType: string
  description?: string

  // オプション詳細
  strike?: number
  expiry?: string
  putCall?: 'P' | 'C'
  multiplier?: number

  // 約定詳細（集約済み）
  orderID: number
  tradeDate: Date
  firstExecutionTime: string // 最初の約定時刻
  totalQuantity: number // 合計数量
  avgPrice: number // 数量加重平均価格
  totalAmount: number // 合計金額
  totalProceeds: number // 合計収益
  buySell: 'BUY' | 'SELL'
  exchange?: string

  // 手数料・損益（合算）
  totalCommission: number
  commissionCurrency?: string
  totalNetCash: number
  totalRealizedPnL: number

  // 約定詳細（配列）
  execIDs: string[] // 元のexecIDの配列
  executionDetails: Array<{
    execID: string
    time: string
    quantity: number
    price: number
    commission: number
  }>

  // バンドル・タグ情報
  bundleId?: string
  tag?: 'PP' | 'P-' | 'P+'

  // ポジション状態
  positionStatus: 'OPEN' | 'CLOSED' | 'EXPIRED'
  closeDate?: Date

  // データソース
  dataSource: 'FLEX_QUERY' | 'REAL_TIME' | 'MANUAL'

  createdAt: Date
  updatedAt: Date
}

const TradeOrderSchema = new Schema<ITradeOrder>(
  {
    accountId: { type: String, required: true, index: true },
    symbol: { type: String, required: true, index: true },
    secType: { type: String, required: true, index: true },
    description: String,

    strike: Number,
    expiry: { type: String, index: true },
    putCall: {
      type: String,
      enum: ['P', 'C'],
      validate: {
        validator: function (v: string) {
          return !v || v === 'P' || v === 'C'
        },
        message: 'putCall must be P, C, or empty',
      },
    },
    multiplier: Number,

    orderID: { type: Number, required: true, unique: true },
    tradeDate: { type: Date, required: true, index: true },
    firstExecutionTime: { type: String, required: true },
    totalQuantity: { type: Number, required: true },
    avgPrice: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    totalProceeds: { type: Number, required: true },
    buySell: { type: String, required: true, enum: ['BUY', 'SELL'] },
    exchange: String,

    totalCommission: { type: Number, default: 0 },
    commissionCurrency: String,
    totalNetCash: { type: Number, default: 0 },
    totalRealizedPnL: Number,

    execIDs: [String], // required を削除、optional に
    executionDetails: [
      {
        execID: String, // required を削除、optional に
        time: { type: String, required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
        commission: { type: Number, required: true },
      },
    ],

    bundleId: { type: String, index: true },
    tag: { type: String, enum: ['PP', 'P-', 'P+'], index: true },

    positionStatus: {
      type: String,
      enum: ['OPEN', 'CLOSED', 'EXPIRED'],
      default: 'OPEN',
      index: true,
    },
    closeDate: Date,

    dataSource: {
      type: String,
      enum: ['FLEX_QUERY', 'REAL_TIME', 'MANUAL'],
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'trade_orders',
  }
)

// 複合インデックス
TradeOrderSchema.index({ symbol: 1, expiry: 1, strike: 1, putCall: 1 })
TradeOrderSchema.index({ positionStatus: 1, tradeDate: -1 })
TradeOrderSchema.index({ bundleId: 1, tag: 1 })

export const TradeOrder = mongoose.model<ITradeOrder>('TradeOrder', TradeOrderSchema, 'trade_orders')
