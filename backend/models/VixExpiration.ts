// backend/models/VixExpiration.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface VixExpirationDoc extends Document {
  expiration: string // 例: "20250916"
  isEnded: boolean // 満期日が過ぎているかどうか
}

const VixExpirationSchema = new Schema<VixExpirationDoc>({
  expiration: { type: String, required: true, unique: true },
})

export const VixExpirationModel = mongoose.model<VixExpirationDoc>(
  'VixExpiration',
  VixExpirationSchema,
  'vix_expirations'
)

// 以下先物用
export interface VixFutureExpirationDoc extends Document {
  expiration: string // 例: "20250917"
  isEnded: boolean // 満期日が過ぎているかどうか
}

const VixFutureExpirationSchema = new Schema<VixFutureExpirationDoc>({
  expiration: { type: String, required: true, unique: true },
})

export const VixFutureExpirationModel = mongoose.model<VixFutureExpirationDoc>(
  'VixFutureExpiration',
  VixFutureExpirationSchema,
  'vix_future_expirations'
)
