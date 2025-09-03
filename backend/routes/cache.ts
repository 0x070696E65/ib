// backend/routes/cache.ts
import express from 'express'
import { PriceCacheController } from '../controllers/PriceCacheController'

const router = express.Router()
const cacheController = new PriceCacheController()

// GET /api/cache/summary - キャッシュ概要
router.get('/summary', cacheController.getCacheSummary)

// GET /api/cache/latest - 最新キャッシュデータ
router.get('/latest', cacheController.getLatestCache)

// POST /api/cache/check - キャッシュ利用可能性チェック
router.post('/check', cacheController.checkCacheValidity)

// DELETE /api/cache - キャッシュクリア
router.delete('/', cacheController.clearCache)

router.post('/save', cacheController.saveCache)

export default router
