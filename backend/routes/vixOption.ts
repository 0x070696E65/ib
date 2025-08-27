import { Router } from 'express'
import { OptionClosePriceModel } from '../models/OptionClosePrice'
import { VixDataService } from '../services/VixDataService'

const router = Router()

// 全データ一括取得（スマート最適化対応）
router.post('/all', async (req, res) => {
  try {
    const strikes = req.body?.strikes || [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]
    const useBatchProcessing = req.body?.batchProcessing !== false // デフォルトはtrue

    console.log(`一括取得開始: ${strikes.length}ストライク, バッチ処理=${useBatchProcessing}`)

    let summary
    if (useBatchProcessing) {
      // スマート最適化バッチ処理版を使用
      const vixDataService = new VixDataService()
      summary = await vixDataService.fetchAllVixData(strikes)
    }

    res.json({
      ...summary,
      processingType: useBatchProcessing ? 'smart-batch' : 'sequential',
    })
  } catch (err) {
    console.error('一括取得エラー:', err)
    res.status(500).json({
      error: String(err),
      message: 'VIXオプションデータの一括取得中にエラーが発生しました',
      processingType: 'error',
    })
  }
})

// 指定満期日のデータ
router.get('/:contract', async (req, res) => {
  const { contract } = req.params
  try {
    const docs = await OptionClosePriceModel.find({ contract }).sort({ strike: 1, date: 1 })
    res.json(docs)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'DB fetch error' })
  }
})

export default router
