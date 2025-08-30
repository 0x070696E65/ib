// routes/positions.ts
import { Router } from 'express'
import { PositionStreamController } from '../controllers/PositionStreamController'

const router = Router()
const controller = new PositionStreamController()

// SSEストリームエンドポイント
router.get('/stream', (req, res) => {
  controller.streamPositions(req, res)
})

// 静的データ取得（初期表示・分析用）
router.get('/current', (req, res) => {
  controller.getStaticPositions(req, res)
})

// 監視制御
router.post('/control', (req, res) => {
  controller.controlMonitoring(req, res)
})

// 接続統計
router.get('/stats', (req, res) => {
  controller.getConnectionStats(req, res)
})

export default router
