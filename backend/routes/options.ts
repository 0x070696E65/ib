// backend/routes/options.ts
import express from 'express'
import { OptionController } from '../controllers/OptionController'

const router = express.Router()
const optionController = new OptionController()

/**
 * 指定範囲のオプション価格を取得
 * POST /api/options/prices
 * Body: { expiration: string, strikeMin: number, strikeMax: number, stepSize?: number }
 */
router.post('/prices', optionController.getPriceRange.bind(optionController))

/**
 * 単一オプションの価格を取得
 * GET /api/options/prices/:expiration/:strike
 */
router.get('/prices/:expiration/:strike', optionController.getSinglePrice.bind(optionController))

/**
 * 複数満期の価格を取得
 * POST /api/options/prices/multi
 * Body: { expirations: string[], strikeMin: number, strikeMax: number, stepSize?: number }
 */
router.post('/prices/multi', optionController.getMultiExpirationPrices.bind(optionController))

/**
 * オプション損益を計算
 * POST /api/options/calculate
 * Body: { strike: number, premium: number, quantity: number, scenarioMin: number, scenarioMax: number, stepSize?: number }
 */
router.post('/calculate', optionController.calculateProfit.bind(optionController))

/**
 * 利用可能な満期日を取得
 * GET /api/options/expirations
 */
router.get('/expirations', optionController.getAvailableExpirations.bind(optionController))

export default router
