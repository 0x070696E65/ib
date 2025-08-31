// backend/models/TradeExecution.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface ITradeExecution extends Document {
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

  // 約定詳細
  tradeDate: Date
  tradeTime?: string
  quantity: number
  price: number
  amount: number
  proceeds: number
  buySell: 'BUY' | 'SELL'
  exchange?: string

  // 手数料・損益（手数料は計算に含めないが記録）
  ibCommission: number
  ibCommissionCurrency?: string
  netCash: number
  realizedPnL?: number

  // 識別情報
  execID: object
  orderID?: number
  ibOrderID?: string

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

const TradeExecutionSchema = new Schema<ITradeExecution>(
  {
    accountId: { type: String, required: true, index: true },
    symbol: { type: String, required: true, index: true },
    secType: { type: String, required: true, index: true },
    description: String,

    strike: Number, // required を削除
    expiry: String, // required を削除
    putCall: {
      type: String,
      enum: ['P', 'C'],
      // required を削除し、空文字列の場合はundefinedにする
      validate: {
        validator: function (v: string) {
          return !v || v === 'P' || v === 'C'
        },
        message: 'putCall must be P, C, or empty',
      },
    },
    multiplier: Number,

    tradeDate: { type: Date, required: true, index: true },
    tradeTime: String,
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    amount: { type: Number, default: 0 },
    proceeds: { type: Number, default: 0 },
    buySell: { type: String, required: true, enum: ['BUY', 'SELL'] },
    exchange: String,

    ibCommission: { type: Number, default: 0 },
    ibCommissionCurrency: String,
    netCash: { type: Number, default: 0 },
    realizedPnL: Number,
    execID: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: function (v: string) {
          return v && v.trim().length > 0
        },
        message: 'execID cannot be empty',
      },
    },
    orderID: Number,
    ibOrderID: String,

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
    collection: 'trade_executions',
  }
)

// 複合インデックス
TradeExecutionSchema.index({ symbol: 1, expiry: 1, strike: 1, putCall: 1 })
TradeExecutionSchema.index({ positionStatus: 1, tradeDate: -1 })
TradeExecutionSchema.index({ bundleId: 1, tag: 1 })

export const TradeExecution = mongoose.model<ITradeExecution>(
  'TradeExecution',
  TradeExecutionSchema,
  'trade_executions'
)

// backend/models/TradeBundle.ts
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
