// backend/models/FutureClosePrice.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface FutureClosePrice extends Document {
  contract: string
  date: Date
  close: number
}

const FutureClosePriceSchema = new Schema<FutureClosePrice>({
  contract: { type: String, required: true },
  date: { type: Date, required: true },
  close: { type: Number, required: true },
})

// 重複を防ぐユニークインデックス
FutureClosePriceSchema.index({ contract: 1, date: 1 }, { unique: true })

export const FutureClosePriceModel = mongoose.model<FutureClosePrice>(
  'FutureClosePrice',
  FutureClosePriceSchema,
  'vix_future'
)
