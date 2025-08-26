// backend/models/VixExpiration.ts
import mongoose, { Schema, Document } from 'mongoose'

export interface VixExpirationDoc extends Document {
  expiration: string // 例: "20250916"
}

const VixExpirationSchema = new Schema<VixExpirationDoc>({
  expiration: { type: String, required: true, unique: true },
})

export const VixExpirationModel = mongoose.model<VixExpirationDoc>(
  'VixExpiration',
  VixExpirationSchema,
  'vix_expirations'
)

// キャッシュの状態
export interface ExpirationCacheStateDoc extends Document {
  lastUpdated: Date
}
const ExpirationCacheStateSchema = new Schema<ExpirationCacheStateDoc>({
  lastUpdated: { type: Date, required: true },
})

export const ExpirationCacheStateModel = mongoose.model<ExpirationCacheStateDoc>(
  'ExpirationCacheState',
  ExpirationCacheStateSchema,
  'vix_expiration_state'
)
