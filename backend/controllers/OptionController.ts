// backend/controllers/OptionController.ts
import { Request, Response } from 'express'
import { createIbServices } from '../services'
import { OptionPrice, OptionPriceRequest } from '../services/OptionPriceService'
import { VixExpirationModel } from '../models/VixExpiration'

export interface ProfitCalculation {
  strike: number
  premium: number
  quantity: number
  scenarios: Array<{
    futurePrice: number
    profit: number
  }>
}

export interface CalculateRequest {
  strike: number
  premium: number
  quantity: number
  scenarioMin: number
  scenarioMax: number
  stepSize?: number
}

export class OptionController {
  /**
   * 指定範囲のオプション価格を取得
   * POST /api/options/prices
   */
  async getPriceRange(req: Request, res: Response): Promise<void> {
    try {
      const { expiration, strikeMin, strikeMax, stepSize = 1 } = req.body

      if (!expiration || !strikeMin || !strikeMax) {
        res.status(400).json({
          success: false,
          message: '満期日、ストライク範囲は必須です',
        })
        return
      }

      if (strikeMin >= strikeMax || strikeMax - strikeMin > 50) {
        res.status(400).json({
          success: false,
          message: 'ストライク範囲が無効です（最大50刻み）',
        })
        return
      }

      const { optionPrice } = createIbServices()
      const request: OptionPriceRequest = {
        expiration,
        strikeMin,
        strikeMax,
        stepSize,
      }

      const prices = await optionPrice.getOptionPrices(request)

      res.json({
        success: true,
        message: `${prices.length}件の価格を取得しました`,
        data: {
          expiration,
          strikeRange: { min: strikeMin, max: strikeMax, step: stepSize },
          prices,
          summary: {
            total: prices.length,
            withBidAsk: prices.filter((p) => p.bid > 0 && p.ask > 0).length,
            avgSpread: this.calculateAverageSpread(prices),
          },
        },
      })
    } catch (error) {
      console.error('オプション価格取得エラー:', error)
      res.status(500).json({
        success: false,
        message: '価格取得に失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * 単一オプションの価格を取得
   * GET /api/options/prices/:expiration/:strike
   */
  async getSinglePrice(req: Request, res: Response): Promise<void> {
    try {
      const { expiration, strike } = req.params
      const strikeNum = parseFloat(strike)

      if (!expiration || isNaN(strikeNum)) {
        res.status(400).json({
          success: false,
          message: '満期日とストライクは必須です',
        })
        return
      }

      console.log(`単一オプション価格取得: ${expiration} ${strikeNum}P`)

      const { optionPrice } = createIbServices()
      const price = await optionPrice.getSingleOptionPrice(expiration, strikeNum)

      res.json({
        success: true,
        message: '価格を取得しました',
        data: price,
      })
    } catch (error) {
      console.error('単一価格取得エラー:', error)
      res.status(500).json({
        success: false,
        message: '価格取得に失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * 複数満期の価格を取得
   * POST /api/options/prices/multi
   */
  async getMultiExpirationPrices(req: Request, res: Response): Promise<void> {
    try {
      const { expirations, strikeMin, strikeMax, stepSize = 1 } = req.body

      if (!expirations || !Array.isArray(expirations) || !strikeMin || !strikeMax) {
        res.status(400).json({
          success: false,
          message: '満期日配列、ストライク範囲は必須です',
        })
        return
      }

      console.log(`複数満期価格取得: ${expirations.length}満期, ${strikeMin}-${strikeMax}`)

      const { optionPrice } = createIbServices()
      const results = await optionPrice.getMultiExpirationPrices(expirations, strikeMin, strikeMax, stepSize)

      // Map to Object for JSON response
      const resultObj: Record<string, OptionPrice[]> = {}
      results.forEach((prices, expiration) => {
        resultObj[expiration] = prices
      })

      const totalPrices = Array.from(results.values()).flat().length

      res.json({
        success: true,
        message: `${totalPrices}件の価格を取得しました`,
        data: {
          expirations,
          strikeRange: { min: strikeMin, max: strikeMax, step: stepSize },
          results: resultObj,
          summary: {
            totalExpirations: expirations.length,
            totalPrices,
            averagePricesPerExpiration: Math.round(totalPrices / expirations.length),
          },
        },
      })
    } catch (error) {
      console.error('複数満期価格取得エラー:', error)
      res.status(500).json({
        success: false,
        message: '価格取得に失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * オプション損益を計算
   * POST /api/options/calculate
   */
  async calculateProfit(req: Request, res: Response): Promise<void> {
    try {
      const { strike, premium, quantity, scenarioMin, scenarioMax, stepSize = 1 }: CalculateRequest = req.body

      if (!strike || !premium || !quantity || !scenarioMin || !scenarioMax) {
        res.status(400).json({
          success: false,
          message: 'ストライク、プレミアム、数量、シナリオ範囲は必須です',
        })
        return
      }

      console.log(`損益計算: Strike=${strike}, Premium=${premium}, Qty=${quantity}`)

      const scenarios: Array<{ futurePrice: number; profit: number }> = []

      for (let futurePrice = scenarioMin; futurePrice <= scenarioMax; futurePrice += stepSize) {
        const profit = this.calculateSingleScenario(strike, premium, quantity, futurePrice)
        scenarios.push({ futurePrice, profit })
      }

      const result: ProfitCalculation = {
        strike,
        premium,
        quantity,
        scenarios,
      }

      // 損益分岐点を計算
      const breakEvenPoint = this.findBreakEvenPoint(scenarios)
      const maxProfit = Math.max(...scenarios.map((s) => s.profit))
      const maxLoss = Math.min(...scenarios.map((s) => s.profit))

      res.json({
        success: true,
        message: '損益計算が完了しました',
        data: {
          ...result,
          analysis: {
            breakEvenPoint,
            maxProfit,
            maxLoss,
            profitableRange: {
              min: scenarios.find((s) => s.profit > 0)?.futurePrice || null,
              max: scenarios.filter((s) => s.profit > 0).pop()?.futurePrice || null,
            },
          },
        },
      })
    } catch (error) {
      console.error('損益計算エラー:', error)
      res.status(500).json({
        success: false,
        message: '損益計算に失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * 利用可能な満期日を取得
   * GET /api/options/expirations
   */
  async getAvailableExpirations(req: Request, res: Response): Promise<void> {
    try {
      const expirations = await VixExpirationModel.find({}).sort({ expiration: 1 })

      res.json({
        success: true,
        message: `${expirations.length}件の満期日を取得しました`,
        data: expirations.map((exp) => ({
          expiration: exp.expiration,
          formatted: this.formatExpiration(exp.expiration),
        })),
      })
    } catch (error) {
      console.error('満期日取得エラー:', error)
      res.status(500).json({
        success: false,
        message: '満期日取得に失敗しました',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // Utility methods
  private calculateSingleScenario(strike: number, premium: number, quantity: number, futurePrice: number): number {
    if (quantity > 0) {
      // PUT買い
      if (futurePrice >= strike) {
        return -premium * quantity // プレミアム損失のみ
      } else {
        return -premium * quantity + (strike - futurePrice) * quantity // 内在価値
      }
    } else {
      // PUT売り
      const absQuantity = Math.abs(quantity)
      if (futurePrice >= strike) {
        return premium * absQuantity // プレミアム収益のみ
      } else {
        return premium * absQuantity - (strike - futurePrice) * absQuantity // 損失発生
      }
    }
  }

  private findBreakEvenPoint(scenarios: Array<{ futurePrice: number; profit: number }>): number | null {
    for (let i = 0; i < scenarios.length - 1; i++) {
      const current = scenarios[i]
      const next = scenarios[i + 1]

      if ((current.profit <= 0 && next.profit > 0) || (current.profit > 0 && next.profit <= 0)) {
        // Linear interpolation for more precise break-even
        const ratio = Math.abs(current.profit) / (Math.abs(current.profit) + Math.abs(next.profit))
        return current.futurePrice + (next.futurePrice - current.futurePrice) * ratio
      }
    }
    return null
  }

  private calculateAverageSpread(prices: OptionPrice[]): number {
    const validPrices = prices.filter((p) => p.bid > 0 && p.ask > 0)
    if (validPrices.length === 0) return 0

    const totalSpread = validPrices.reduce((sum, p) => sum + (p.ask - p.bid), 0)
    return totalSpread / validPrices.length
  }

  private formatExpiration(expiration: string): string {
    // "20250916" -> "2025-09-16"
    return `${expiration.slice(0, 4)}-${expiration.slice(4, 6)}-${expiration.slice(6, 8)}`
  }
}
