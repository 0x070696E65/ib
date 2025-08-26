// routes/vixDataFetch.ts
import { Router } from 'express'
import { VixDataService } from '../services/VixDataService'

const router = Router()
const vixDataService = new VixDataService()

// 全データ一括取得
router.post('/all', async (req, res) => {
  try {
    const strikes = req.body?.strikes || [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]

    const summary = await vixDataService.fetchAllVixData(strikes)
    res.json(summary)
  } catch (err) {
    console.error('一括取得エラー:', err)
    res.status(500).json({
      error: String(err),
      message: 'VIXオプションデータの一括取得中にエラーが発生しました',
    })
  }
})

// テスト用エンドポイント
router.post('/test', async (req, res) => {
  try {
    const expiration = req.body.expiration || '20250916'
    const strikes = req.body.strikes || [18, 19, 20]

    const summary = await vixDataService.fetchTestData(expiration, strikes)
    res.json(summary)
  } catch (err) {
    console.error('テストデータ取得エラー:', err)
    res.status(500).json({
      error: String(err),
      message: 'テストデータ取得中にエラーが発生しました',
    })
  }
})

// 満期日のみ取得・更新
router.post('/expirations', async (req, res) => {
  try {
    const expirations = await vixDataService.getAndSaveExpirations()
    res.json({
      data: expirations,
      count: expirations.length,
      message: '満期日の取得・保存が完了しました',
    })
  } catch (err) {
    console.error('満期日取得エラー:', err)
    res.status(500).json({
      error: String(err),
      message: '満期日取得中にエラーが発生しました',
    })
  }
})

export default router
