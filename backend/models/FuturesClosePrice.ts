// backend/models/FuturesClosePrice.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface FuturesClosePrice extends Document {
  contract: string
  date: Date
  close: number
}

const FuturesClosePriceSchema = new Schema<FuturesClosePrice>({
  contract: { type: String, required: true },
  date: { type: Date, required: true },
  close: { type: Number, required: true },
})

// 重複を防ぐユニークインデックス
FuturesClosePriceSchema.index({ contract: 1, date: 1 }, { unique: true })

export const FuturesClosePriceModel = mongoose.model<FuturesClosePrice>(
  'FuturesClosePrice',
  FuturesClosePriceSchema,
  'vix_futures'
)
