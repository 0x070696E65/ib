// routes/vixDataFetch.ts (最適化対応版)
import { Router } from 'express'
import { VixDataService } from '../services/VixDataService'

const router = Router()
const vixDataService = new VixDataService()

// 全データ一括取得（スマート最適化対応）
router.post('/all', async (req, res) => {
  try {
    const strikes = req.body?.strikes || [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]
    const useBatchProcessing = req.body?.batchProcessing !== false // デフォルトはtrue

    console.log(`一括取得開始: ${strikes.length}ストライク, バッチ処理=${useBatchProcessing}`)

    let summary
    if (useBatchProcessing) {
      // スマート最適化バッチ処理版を使用（推奨）
      summary = await vixDataService.fetchAllVixData(strikes)
    } else {
      // フォールバック：従来の逐次処理版（固定360D）
      summary = await vixDataService.fetchAllVixDataSequential(strikes)
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

// 最適化プレビュー（実行前の効率予測）
router.get('/optimization-preview', async (req, res) => {
  try {
    const strikes = req.query.strikes
      ? JSON.parse(req.query.strikes as string)
      : [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]

    console.log('最適化プレビュー取得中...')
    const preview = await vixDataService.getOptimizationPreview(strikes)

    res.json({
      ...preview,
      message: '最適化プレビューを生成しました',
      recommendation:
        preview.optimizationBreakdown['30D'] > preview.totalContracts * 0.5
          ? 'スマート最適化により大幅な高速化が期待できます'
          : 'スマート最適化による改善は限定的ですが、効率化されます',
    })
  } catch (err) {
    console.error('最適化プレビュー取得エラー:', err)
    res.status(500).json({
      error: String(err),
      message: '最適化プレビューの取得中にエラーが発生しました',
    })
  }
})

// 接続状況確認エンドポイント
router.get('/connection-status', (req, res) => {
  try {
    const status = vixDataService.getConnectionStatus()
    res.json(status)
  } catch (err) {
    console.error('接続状況取得エラー:', err)
    res.status(500).json({
      error: String(err),
      message: '接続状況の取得中にエラーが発生しました',
    })
  }
})

// 軽量版：特定の満期日とストライクのみを取得（最適化対応）
/* router.post('/specific', async (req, res) => {
  try {
    const { expiration, strikes, useOptimization } = req.body

    if (!expiration) {
      return res.status(400).json({
        error: '満期日(expiration)は必須です',
      })
    }

    const targetStrikes = strikes || [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]

    console.log(`特定満期日取得: ${expiration}, ${targetStrikes.length}ストライク, 最適化=${useOptimization}`)

    if (useOptimization) {
      // 最適化版: 個別に最適な期間を決定
      const optimizedResults = []
      
      for (const strike of targetStrikes) {
        try {
          const lastMarketDate = await vixDataService['getLastMarketDate'](expiration, strike)
          const optimization = vixDataService['calculateOptimalDuration'](lastMarketDate)
          
          const ibService = vixDataService['ibService']
          const result = await ibService.fetchVixOptionBars(
            expiration, 
            strike, 
            optimization.durationDays,
            lastMarketDate
          )
          
          optimizedResults.push({
            ...result,
            optimization: {
              durationDays: optimization.durationDays,
              reason: optimization.reason,
              lastMarketDate
            }
          })
        } catch (error) {
          console.error(`最適化取得エラー ${expiration} Strike${strike}:`, error)
          optimizedResults.push({
            contract: expiration,
            strike,
            data: [],
            error: String(error)
          })
        }
      }

      const summary = {
        expiration,
        strikes: targetStrikes,
        totalRequests: optimizedResults.length,
        successCount: optimizedResults.filter(r => !r.error).length,
        data: optimizedResults,
        message: `満期日 ${expiration} のデータ取得完了（最適化版）`,
        processingType: 'optimized'
      }

      res.json(summary)

    } else {
      // 従来版: 固定360D
      const requests = targetStrikes.map((strike: any) => ({
        contractMonth: expiration,
        strike: strike,
        durationDays: 360,
        fromDate: undefined,
      }))

      const ibService = vixDataService['ibService']
      await ibService.connect()
      
      const results = await ibService.fetchMultipleVixOptionBars(requests)

      const summary = {
        expiration,
        strikes: targetStrikes,
        totalRequests: results.length,
        successCount: results.length,
        data: results,
        message: `満期日 ${expiration} のデータ取得完了（従来版）`,
        processingType: 'traditional'
      }

      await ibService.cleanup()
      res.json(summary)
    }

  } catch (err) {
    console.error('特定データ取得エラー:', err)
    res.status(500).json({
      error: String(err),
      message: '特定データの取得中にエラーが発生しました'
    })
  }
}) */

export default router
