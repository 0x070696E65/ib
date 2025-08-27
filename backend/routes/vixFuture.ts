// routes/vixFutureDataFetch.ts
import { Router } from 'express'
import { FutureClosePriceModel } from '../models/FutureClosePrice'
import { VixDataService } from '../services/VixDataService'

const router = Router()

// 先物データ全一括取得（スマート最適化対応）
router.post('/all', async (req, res) => {
  try {
    console.log('VIX先物一括取得開始')

    const vixDataService = new VixDataService()
    const summary = await vixDataService.fetchAllVixFutureData()

    res.json({
      ...summary,
      processingType: 'smart-batch',
    })
  } catch (err) {
    console.error('先物一括取得エラー:', err)
    res.status(500).json({
      error: String(err),
      message: 'VIX先物データの一括取得中にエラーが発生しました',
      processingType: 'error',
    })
  }
})

// 指定契約月のデータ
router.get('/:contract', async (req, res) => {
  const { contract } = req.params
  try {
    const docs = await FutureClosePriceModel.find({ contract }).sort({ date: 1 })
    res.json(docs)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'DB fetch error' })
  }
})

// 全契約の最新データ
router.get('/', async (req, res) => {
  try {
    const docs = await FutureClosePriceModel.aggregate([
      { $sort: { contract: 1, date: -1 } },
      {
        $group: {
          _id: '$contract',
          latestDate: { $first: '$date' },
          latestClose: { $first: '$close' },
          contract: { $first: '$contract' },
        },
      },
      { $sort: { contract: 1 } },
    ])
    res.json(docs)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'DB fetch error' })
  }
})

export default router
