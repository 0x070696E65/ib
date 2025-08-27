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

// 以下先物用
export interface VixFutureExpirationDoc extends Document {
  expiration: string // 例: "20250917"
}

const VixFutureExpirationSchema = new Schema<VixFutureExpirationDoc>({
  expiration: { type: String, required: true, unique: true },
})

export const VixFutureExpirationModel = mongoose.model<VixFutureExpirationDoc>(
  'VixFutureExpiration',
  VixFutureExpirationSchema,
  'vix_future_expirations'
)

// 先物キャッシュ状態用
export interface FutureExpirationCacheStateDoc extends Document {
  lastUpdated: Date
}

const FutureExpirationCacheStateSchema = new Schema<FutureExpirationCacheStateDoc>({
  lastUpdated: { type: Date, required: true },
})

export const FutureExpirationCacheStateModel = mongoose.model<FutureExpirationCacheStateDoc>(
  'FutureExpirationCacheState',
  FutureExpirationCacheStateSchema,
  'vix_future_expiration_state'
)
