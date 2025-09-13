// backend/routes/pnl.ts
import express from 'express'
import { PnLAnalysisController } from '../controllers/PnLAnalysisController'

const router = express.Router()
const pnlController = new PnLAnalysisController()

// 基本損益分析（タグフィルタ対応）
router.get('/basic', (req, res) => pnlController.getBasicPnLAnalysis(req, res))

// 取引詳細（ページネーション付き）- 新規追加
router.get('/trades', (req, res) => pnlController.getTradeDetails(req, res))

// 月次分析
router.get('/monthly', (req, res) => pnlController.getMonthlyPnLAnalysis(req, res))

// タグ別分析
router.get('/tags', (req, res) => pnlController.getTagAnalysis(req, res))

export default router
