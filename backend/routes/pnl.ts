// backend/routes/pnl.ts
import express from 'express'
import { PnLAnalysisController } from '../controllers/PnLAnalysisController'

const router = express.Router()
const pnlController = new PnLAnalysisController()

// GET /api/pnl/basic - 基本損益分析
router.get('/basic', pnlController.getBasicAnalysis)

// GET /api/pnl/monthly - 月次集計
router.get('/monthly', pnlController.getMonthlyAnalysis)

// GET /api/pnl/tags - タグ別分析
router.get('/tags', pnlController.getTagAnalysis)

export default router
