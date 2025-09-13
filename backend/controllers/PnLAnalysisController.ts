// backend/controllers/PnLAnalysisController.ts
import { Request, Response } from 'express'
import { PnLAnalysisService } from '../services/PnLAnalysisService'

export class PnLAnalysisController {
  private pnlAnalysisService: PnLAnalysisService

  constructor() {
    this.pnlAnalysisService = new PnLAnalysisService()
  }

  /**
   * 基本損益分析を取得（タグフィルタ対応）
   */
  async getBasicPnLAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, symbol = 'VIX', tag } = req.query

      const start = startDate ? new Date(startDate as string) : undefined
      const end = endDate ? new Date(endDate as string) : undefined
      const selectedTag = tag && tag !== '' ? (tag as string) : undefined

      const analysis = await this.pnlAnalysisService.getBasicPnLAnalysis(start, end, symbol as string, selectedTag)

      res.json({
        success: true,
        data: analysis,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      console.error('基本損益分析エラー:', error)
      res.status(500).json({
        success: false,
        message: '基本損益分析の取得に失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * 取引詳細を取得（ページネーション付き）
   */
  async getTradeDetails(req: Request, res: Response): Promise<void> {
    try {
      const {
        startDate,
        endDate,
        symbol = 'VIX',
        tag,
        page = '1',
        limit = '50',
        sortBy = 'tradeDate',
        sortOrder = 'desc',
      } = req.query

      const start = startDate ? new Date(startDate as string) : undefined
      const end = endDate ? new Date(endDate as string) : undefined
      const selectedTag = tag && tag !== '' ? (tag as string) : undefined

      const pageNum = parseInt(page as string, 10)
      const limitNum = parseInt(limit as string, 10)

      // バリデーション
      if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
        res.status(400).json({
          success: false,
          message: 'Invalid page or limit parameters',
        })
        return
      }

      const details = await this.pnlAnalysisService.getTradeDetails(
        start,
        end,
        symbol as string,
        selectedTag,
        pageNum,
        limitNum,
        sortBy as string,
        sortOrder as 'asc' | 'desc'
      )

      res.json({
        success: true,
        data: details,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      console.error('取引詳細取得エラー:', error)
      res.status(500).json({
        success: false,
        message: '取引詳細の取得に失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * 月次損益分析を取得
   */
  async getMonthlyPnLAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, symbol = 'VIX' } = req.query

      const start = startDate ? new Date(startDate as string) : undefined
      const end = endDate ? new Date(endDate as string) : undefined

      const monthlyData = await this.pnlAnalysisService.getMonthlyPnLSummary(start, end, symbol as string)

      res.json({
        success: true,
        data: monthlyData,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      console.error('月次分析エラー:', error)
      res.status(500).json({
        success: false,
        message: '月次分析の取得に失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * タグ別分析を取得
   */
  async getTagAnalysis(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, symbol = 'VIX' } = req.query

      const start = startDate ? new Date(startDate as string) : undefined
      const end = endDate ? new Date(endDate as string) : undefined

      const tagData = await this.pnlAnalysisService.getTagAnalysis(start, end, symbol as string)

      res.json({
        success: true,
        data: tagData,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      console.error('タグ分析エラー:', error)
      res.status(500).json({
        success: false,
        message: 'タグ分析の取得に失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
}
