// backend/models/OptionClosePrice.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface OptionClosePriceDoc extends Document {
  contract: string
  strike: number
  date: Date
  close: number
}

const OptionClosePriceSchema = new Schema<OptionClosePriceDoc>({
  contract: { type: String, required: true },
  strike: { type: Number, required: true },
  date: { type: Date, required: true },
  close: { type: Number, required: true },
})

// 重複を防ぐユニークインデックス
OptionClosePriceSchema.index({ contract: 1, strike: 1, date: 1 }, { unique: true })

export const OptionClosePriceModel = mongoose.model<OptionClosePriceDoc>(
  'OptionClosePrice',
  OptionClosePriceSchema,
  'vix_options'
)
