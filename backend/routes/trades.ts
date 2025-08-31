// backend/routes/trades.ts
import express from 'express'
import { TradeController } from '../controllers/TradeController'

const router = express.Router()
const tradeController = new TradeController()

// データインポート
router.post('/import-flex-data', tradeController.importFlexData.bind(tradeController))

// ポジションマッチング
router.get('/position-matching', tradeController.getPositionMatching.bind(tradeController))

// バンドル管理
router.post('/bundles', tradeController.createBundle.bind(tradeController))
router.get('/bundles', tradeController.getBundles.bind(tradeController))

// タグ管理
router.post('/tag-position', tradeController.tagPosition.bind(tradeController))

// 分析・履歴
router.get('/analysis', tradeController.getAnalysisData.bind(tradeController))
router.get('/history', tradeController.getTradeHistory.bind(tradeController))

export default router
