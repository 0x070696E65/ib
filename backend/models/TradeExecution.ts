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
  execID: string
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

    strike: { type: Number, index: true },
    expiry: { type: String, index: true },
    putCall: { type: String, enum: ['P', 'C'] },
    multiplier: Number,

    tradeDate: { type: Date, required: true, index: true },
    tradeTime: String,
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    amount: Number,
    proceeds: Number,
    buySell: { type: String, required: true, enum: ['BUY', 'SELL'] },
    exchange: String,

    ibCommission: { type: Number, default: 0 },
    ibCommissionCurrency: String,
    netCash: Number,
    realizedPnL: Number,

    execID: { type: String, required: true, unique: true },
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
