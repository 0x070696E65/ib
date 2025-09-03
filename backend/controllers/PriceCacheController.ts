// backend/controllers/PriceCacheController.ts
import { Request, Response } from 'express'
import { PriceCacheService } from '../services/ib-service/PriceCacheService'

export class PriceCacheController {
  private cacheService: PriceCacheService

  constructor() {
    this.cacheService = new PriceCacheService()
  }

  /**
   * GET /api/cache/summary - キャッシュ概要情報取得
   */
  public getCacheSummary = async (req: Request, res: Response): Promise<void> => {
    try {
      const summary = await this.cacheService.getCacheSummary()
      res.json({
        success: true,
        data: summary,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      console.error('キャッシュ概要取得エラー:', error)
      res.status(500).json({
        success: false,
        message: 'キャッシュ概要の取得に失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * GET /api/cache/latest - 最新キャッシュデータ取得
   */
  public getLatestCache = async (req: Request, res: Response): Promise<void> => {
    try {
      const cache = await this.cacheService.getLatestCache()

      if (!cache) {
        res.json({
          success: true,
          data: null,
          message: 'キャッシュデータが見つかりません',
        })
        return
      }

      res.json({
        success: true,
        data: cache,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      console.error('キャッシュデータ取得エラー:', error)
      res.status(500).json({
        success: false,
        message: 'キャッシュデータの取得に失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * POST /api/cache/check - キャッシュ利用可能性チェック
   */
  public checkCacheValidity = async (req: Request, res: Response): Promise<void> => {
    try {
      const { expirations, strikeMin, strikeMax, stepSize } = req.body

      if (!expirations || !Array.isArray(expirations)) {
        res.status(400).json({
          success: false,
          message: 'expirations配列が必要です',
        })
        return
      }

      const isValid = await this.cacheService.isCacheValidFor({
        expirations,
        strikeMin,
        strikeMax,
        stepSize,
      })

      res.json({
        success: true,
        data: { isValid },
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      console.error('キャッシュチェックエラー:', error)
      res.status(500).json({
        success: false,
        message: 'キャッシュチェックに失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * DELETE /api/cache - キャッシュデータ削除
   */
  public clearCache = async (req: Request, res: Response): Promise<void> => {
    try {
      await this.cacheService.clearCache()

      res.json({
        success: true,
        message: 'キャッシュデータを削除しました',
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      console.error('キャッシュ削除エラー:', error)
      res.status(500).json({
        success: false,
        message: 'キャッシュ削除に失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  public saveCache = async (req: Request, res: Response): Promise<void> => {
    try {
      const { expirations, strikeMin, strikeMax, stepSize, optionPrices, futurePrices, strategies, fetchDuration } =
        req.body

      const id = await this.cacheService.saveToCache(
        { expirations, strikeMin, strikeMax, stepSize },
        optionPrices,
        futurePrices,
        strategies || [],
        fetchDuration
      )

      res.json({
        success: true,
        data: { id },
        message: 'キャッシュに保存しました',
      })
    } catch (error) {
      // エラーハンドリング
    }
  }
}
