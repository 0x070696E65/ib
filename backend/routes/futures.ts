// backend/routes/futures.ts
import express from 'express'
import { FutureController } from '../controllers/FutureController'

const router = express.Router()
const futureController = new FutureController()

// POST /api/futures/prices - 複数満期の先物価格取得
router.post('/prices', futureController.getFuturePrices)

// GET /api/futures/price/:expiration - 単一満期の先物価格取得
router.get('/price/:expiration', futureController.getSingleFuturePrice)

export default router
