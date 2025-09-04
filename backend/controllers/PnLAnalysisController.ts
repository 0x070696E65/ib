// backend/controllers/PnLAnalysisController.ts
import { Request, Response } from 'express'
import { PnLAnalysisService } from '../services/PnLAnalysisService'

export class PnLAnalysisController {
  private pnlService: PnLAnalysisService

  constructor() {
    this.pnlService = new PnLAnalysisService()
  }

  /**
   * GET /api/pnl/basic - 基本損益分析
   */
  public getBasicAnalysis = async (req: Request, res: Response): Promise<void> => {
    try {
      const { startDate, endDate, symbol } = req.query

      const start = startDate ? new Date(startDate as string) : undefined
      const end = endDate ? new Date(endDate as string) : undefined

      const analysis = await this.pnlService.getBasicPnLAnalysis(start, end, (symbol as string) || 'VIX')

      res.json({
        success: true,
        data: analysis,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      console.error('基本損益分析エラー:', error)
      res.status(500).json({
        success: false,
        message: '損益分析の取得に失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * GET /api/pnl/monthly - 月次集計
   */
  public getMonthlyAnalysis = async (req: Request, res: Response): Promise<void> => {
    try {
      const { startDate, endDate, symbol } = req.query

      const start = startDate ? new Date(startDate as string) : undefined
      const end = endDate ? new Date(endDate as string) : undefined

      const monthlyData = await this.pnlService.getMonthlyPnLSummary(start, end, (symbol as string) || 'VIX')

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
   * GET /api/pnl/tags - タグ別分析
   */
  public getTagAnalysis = async (req: Request, res: Response): Promise<void> => {
    try {
      const { startDate, endDate, symbol } = req.query

      const start = startDate ? new Date(startDate as string) : undefined
      const end = endDate ? new Date(endDate as string) : undefined

      const tagData = await this.pnlService.getTagAnalysis(start, end, (symbol as string) || 'VIX')

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
