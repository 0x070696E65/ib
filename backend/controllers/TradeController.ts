// backend/controllers/TradeController.ts
import { Request, Response } from 'express'
import { AggregatedTradeService } from '../services/ib-service/AggregatedTradeService'
import { createIbServices } from '../services/ib-service'
import { TradeOrder } from '../models/TradeOrder'

export class TradeController {
  private aggregatedTradeService: AggregatedTradeService

  constructor() {
    this.aggregatedTradeService = new AggregatedTradeService()
  }

  /**
   * Flex Query データをインポート
   */
  async importFlexData(req: Request, res: Response): Promise<void> {
    try {
      console.log('Flex Query データインポート開始...')
      const result = await this.aggregatedTradeService.importAndAggregateFlexExecutions()

      res.json({
        success: true,
        message: `インポート完了: ${result.imported}件新規, ${result.skipped}件スキップ`,
        data: result,
      })
    } catch (error) {
      console.error('Flex Query インポートエラー:', error)
      res.status(500).json({
        success: false,
        message: 'データインポートに失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * リアルタイムポジションと約定データのマッチング結果を取得
   */
  async getPositionMatching(req: Request, res: Response): Promise<void> {
    try {
      const { positions } = createIbServices()
      const currentPositions = await positions.getCurrentPositions()

      const matchResults = await this.aggregatedTradeService.matchPositionsWithOrders(currentPositions)

      res.json({
        success: true,
        data: {
          totalPositions: currentPositions.length,
          matchedPositions: matchResults.filter((r: any) => r.matched).length,
          results: matchResults,
        },
      })
    } catch (error) {
      console.error('ポジションマッチングエラー:', error)
      res.status(500).json({
        success: false,
        message: 'ポジションマッチングに失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * バンドルを作成
   */
  async createBundle(req: Request, res: Response): Promise<void> {
    try {
      const { name, positionKeys } = req.body

      if (!name || !positionKeys || !Array.isArray(positionKeys)) {
        res.status(400).json({
          success: false,
          message: 'バンドル名とポジションキーは必須です',
        })
        return
      }

      if (positionKeys.length < 2) {
        res.status(400).json({
          success: false,
          message: 'バンドルには最低2つのポジションが必要です',
        })
        return
      }

      const { positions } = createIbServices()
      const currentPositions = await positions.getCurrentPositions()

      const bundle = await this.aggregatedTradeService.createBundle({ name, positionKeys }, currentPositions)

      res.json({
        success: true,
        message: `バンドル "${name}" を作成しました`,
        data: bundle,
      })
    } catch (error) {
      console.error('バンドル作成エラー:', error)
      res.status(500).json({
        success: false,
        message: 'バンドル作成に失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * 単独ポジションにタグ付け
   */
  async tagPosition(req: Request, res: Response): Promise<void> {
    try {
      const { positionKey, tag } = req.body

      if (!positionKey || !tag || !['P+', 'P-'].includes(tag)) {
        res.status(400).json({
          success: false,
          message: 'ポジションキーと有効なタグ（P+, P-）は必須です',
        })
        return
      }

      const { positions } = createIbServices()
      const currentPositions = await positions.getCurrentPositions()

      await this.aggregatedTradeService.tagSinglePosition(positionKey, tag, currentPositions)

      res.json({
        success: true,
        message: `ポジションに ${tag} タグを設定しました`,
      })
    } catch (error) {
      console.error('タグ付けエラー:', error)
      res.status(500).json({
        success: false,
        message: 'タグ付けに失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * 分析データを取得
   */
  async getAnalysisData(req: Request, res: Response): Promise<void> {
    try {
      const analysisData = await this.aggregatedTradeService.getAnalysisData()

      res.json({
        success: true,
        data: analysisData,
      })
    } catch (error) {
      console.error('分析データ取得エラー:', error)
      res.status(500).json({
        success: false,
        message: '分析データの取得に失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * 取引履歴を取得（検索・フィルター付き）
   */
  async getTradeHistory(req: Request, res: Response): Promise<void> {
    try {
      const { symbol, tag, status, startDate, endDate, limit = 100 } = req.query

      const filter: any = {}

      if (symbol) filter.symbol = symbol
      if (tag) filter.tag = tag
      if (status) filter.positionStatus = status

      if (startDate || endDate) {
        filter.tradeDate = {}
        if (startDate) filter.tradeDate.$gte = new Date(startDate as string)
        if (endDate) filter.tradeDate.$lte = new Date(endDate as string)
      }

      const orders = await TradeOrder.find(filter)
        .sort({ tradeDate: -1 })
        .limit(parseInt(limit as string))

      res.json({
        success: true,
        data: {
          orders,
          count: orders.length,
        },
      })
    } catch (error) {
      console.error('取引履歴取得エラー:', error)
      res.status(500).json({
        success: false,
        message: '取引履歴の取得に失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * バンドル一覧を取得
   */
  async getBundles(req: Request, res: Response): Promise<void> {
    try {
      const { status } = req.query
      const filter: any = {}

      if (status) filter.positionStatus = status

      // bundleId が存在するもののみを取得
      filter.bundleId = { $exists: true, $ne: null }

      const bundles = await TradeOrder.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$bundleId',
            name: { $first: '$bundleId' }, // バンドル名の代わりにbundleIdを使用
            symbol: { $first: '$symbol' },
            expiry: { $first: '$expiry' },
            orderCount: { $sum: 1 },
            totalPnL: { $sum: '$totalRealizedPnL' },
            status: { $first: '$positionStatus' },
            createdAt: { $min: '$createdAt' },
          },
        },
        { $sort: { createdAt: -1 } },
      ])

      res.json({
        success: true,
        data: bundles,
      })
    } catch (error) {
      console.error('バンドル取得エラー:', error)
      res.status(500).json({
        success: false,
        message: 'バンドル一覧の取得に失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
}
