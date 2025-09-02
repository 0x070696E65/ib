// backend/controllers/FutureController.ts
import { Request, Response } from 'express'
import { FuturePriceService } from '../services/ib-service/FuturePriceService'
import { createIbServices } from '../services/ib-service'

export class FutureController {
  /**`
   * POST /api/futures/prices
   * Body: { expirations: string[] }
   */
  public getFuturePrices = async (req: Request, res: Response): Promise<void> => {
    try {
      const { expirations } = req.body

      if (!Array.isArray(expirations) || expirations.length === 0) {
        res.status(400).json({
          success: false,
          message: 'expirations配列が必要です',
        })
        return
      }

      console.log(`VIX先物価格取得リクエスト: ${expirations.length}件`)

      const { futurePrice } = createIbServices()
      const pricesMap = await futurePrice.getMultipleFuturePrices(expirations)

      // Map を Object に変換してレスポンス
      const pricesObject = Object.fromEntries(pricesMap)

      res.json({
        success: true,
        data: {
          expirations,
          prices: pricesObject,
        },
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      console.error('VIX先物価格取得エラー:', error)
      res.status(500).json({
        success: false,
        message: 'VIX先物価格の取得に失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * GET /api/futures/price/:expiration
   */
  public getSingleFuturePrice = async (req: Request, res: Response): Promise<void> => {
    try {
      const { expiration } = req.params

      if (!expiration || expiration.length !== 8) {
        res.status(400).json({
          success: false,
          message: '有効な満期日(YYYYMMDD形式)が必要です',
        })
        return
      }

      console.log(`VIX先物価格取得リクエスト: ${expiration}`)

      const { futurePrice } = createIbServices()
      const price = await futurePrice.getSingleFuturePrice(expiration)

      res.json({
        success: true,
        data: price,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      console.error(`VIX先物価格取得エラー(${req.params.expiration}):`, error)
      res.status(500).json({
        success: false,
        message: 'VIX先物価格の取得に失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
}
