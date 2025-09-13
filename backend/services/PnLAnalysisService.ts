// backend/services/PnLAnalysisService.ts
import { TradeOrder } from '../models/TradeOrder'

export interface BasicPnLData {
  date: string
  dailyPnL: number
  cumulativePnL: number
  tradeCount: number
}

export interface PeriodPnLSummary {
  totalPnL: number
  tradeCount: number
  winCount: number
  lossCount: number
  winRate: number
  avgWin: number
  avgLoss: number
  profitFactor: number
}

export interface PnLAnalysisResult {
  summary: PeriodPnLSummary
  dailyData: BasicPnLData[]
  dateRange: {
    start: Date
    end: Date
  }
}

export interface TradeDetail {
  _id: string
  orderID: number
  tradeDate: Date
  symbol: string
  description: string
  buySell: 'BUY' | 'SELL'
  totalQuantity: number
  avgPrice: number
  totalRealizedPnL: number
  tag?: string
  bundleId?: string
  positionStatus: string
  expiry?: string
  strike?: number
  putCall?: 'P' | 'C'
}

export interface TradeDetailsResult {
  trades: TradeDetail[]
  totalCount: number
  currentPage: number
  totalPages: number
}

export class PnLAnalysisService {
  /**
   * 基本的な損益分析データを取得（タグフィルタ追加）
   */
  async getBasicPnLAnalysis(
    startDate?: Date,
    endDate?: Date,
    symbol = 'VIX',
    tag?: string
  ): Promise<PnLAnalysisResult> {
    const dateFilter: any = {}
    if (startDate) dateFilter.$gte = startDate
    if (endDate) dateFilter.$lte = endDate

    const matchFilter: any = {
      symbol: { $regex: `^${symbol}`, $options: 'i' },
      totalRealizedPnL: { $exists: true, $ne: null },
      positionStatus: { $in: ['CLOSED', 'EXPIRED'] },
    }

    if (Object.keys(dateFilter).length > 0) {
      matchFilter.tradeDate = dateFilter
    }

    // タグフィルタ追加
    if (tag) {
      matchFilter.tag = tag
    }

    const trades = await TradeOrder.find(matchFilter)
      .sort({ tradeDate: 1 })
      .select('tradeDate totalRealizedPnL totalQuantity avgPrice buySell positionStatus totalNetCash')
      .lean()

    if (trades.length === 0) {
      return {
        summary: {
          totalPnL: 0,
          tradeCount: 0,
          winCount: 0,
          lossCount: 0,
          winRate: 0,
          avgWin: 0,
          avgLoss: 0,
          profitFactor: 0,
        },
        dailyData: [],
        dateRange: {
          start: startDate || new Date(),
          end: endDate || new Date(),
        },
      }
    }

    const dailyMap = new Map<
      string,
      {
        dailyPnL: number
        tradeCount: number
      }
    >()

    let cumulativePnL = 0
    let totalWins = 0
    let totalLosses = 0
    let totalWinAmount = 0
    let totalLossAmount = 0
    let totalPnL = 0

    trades.forEach((trade) => {
      const dateKey = trade.tradeDate.toISOString().split('T')[0]
      let pnl = trade.totalRealizedPnL

      // 日次集計
      if (!dailyMap.has(dateKey)) dailyMap.set(dateKey, { dailyPnL: 0, tradeCount: 0 })
      const dayData = dailyMap.get(dateKey)!
      dayData.dailyPnL += pnl
      dayData.tradeCount += 1

      // 勝敗統計
      if (pnl > 0) {
        totalWins += 1
        totalWinAmount += pnl
      } else if (pnl < 0) {
        totalLosses += 1
        totalLossAmount += Math.abs(pnl)
      }

      totalPnL += pnl
    })

    // 日次データ配列の作成（累積損益付き）
    const sortedDates = Array.from(dailyMap.keys()).sort()
    const dailyData: BasicPnLData[] = []
    sortedDates.forEach((date) => {
      const dayData = dailyMap.get(date)!
      cumulativePnL += dayData.dailyPnL
      dailyData.push({
        date,
        dailyPnL: dayData.dailyPnL,
        cumulativePnL,
        tradeCount: dayData.tradeCount,
      })
    })

    // 勝率・統計計算
    const totalTrades = trades.length
    const winRate = totalTrades > 0 ? totalWins / totalTrades : 0
    const avgWin = totalWins > 0 ? totalWinAmount / totalWins : 0
    const avgLoss = totalLosses > 0 ? totalLossAmount / totalLosses : 0
    const profitFactor = totalLossAmount > 0 ? totalWinAmount / totalLossAmount : 0

    return {
      summary: {
        totalPnL,
        tradeCount: totalTrades,
        winCount: totalWins,
        lossCount: totalLosses,
        winRate,
        avgWin,
        avgLoss,
        profitFactor,
      },
      dailyData: dailyData,
      dateRange: {
        start: trades[0].tradeDate,
        end: trades[trades.length - 1].tradeDate,
      },
    }
  }

  /**
   * 取引詳細データを取得（ページネーション付き）
   */
  async getTradeDetails(
    startDate?: Date,
    endDate?: Date,
    symbol = 'VIX',
    tag?: string,
    page = 1,
    limit = 50,
    sortBy = 'tradeDate',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): Promise<TradeDetailsResult> {
    const dateFilter: any = {}
    if (startDate) dateFilter.$gte = startDate
    if (endDate) dateFilter.$lte = endDate

    const matchFilter: any = {
      symbol: { $regex: `^${symbol}`, $options: 'i' },
      totalRealizedPnL: { $exists: true, $ne: null },
      positionStatus: { $in: ['CLOSED', 'EXPIRED'] },
    }

    if (Object.keys(dateFilter).length > 0) {
      matchFilter.tradeDate = dateFilter
    }

    // タグフィルタ追加
    if (tag) {
      matchFilter.tag = tag
    }

    // 総数取得
    const totalCount = await TradeOrder.countDocuments(matchFilter)
    const totalPages = Math.ceil(totalCount / limit)
    const skip = (page - 1) * limit

    // ソート設定
    const sortOptions: any = {}
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1

    // データ取得
    const trades = await TradeOrder.find(matchFilter)
      .select(
        'orderID tradeDate symbol description buySell totalQuantity avgPrice totalRealizedPnL tag bundleId positionStatus expiry strike putCall'
      )
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean()

    return {
      trades: trades as unknown as TradeDetail[],
      totalCount,
      currentPage: page,
      totalPages,
    }
  }

  /**
   * 月次集計データを取得
   */
  async getMonthlyPnLSummary(
    startDate?: Date,
    endDate?: Date,
    symbol = 'VIX'
  ): Promise<
    Array<{
      month: string
      totalPnL: number
      tradeCount: number
      winRate: number
    }>
  > {
    const matchFilter: any = {
      symbol: { $regex: `^${symbol}`, $options: 'i' },
      totalRealizedPnL: { $exists: true, $ne: null },
      positionStatus: { $in: ['CLOSED', 'EXPIRED'] },
    }

    if (startDate || endDate) {
      const dateFilter: any = {}
      if (startDate) dateFilter.$gte = startDate
      if (endDate) dateFilter.$lte = endDate
      matchFilter.tradeDate = dateFilter
    }

    const monthlyData = await TradeOrder.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: {
            year: { $year: '$tradeDate' },
            month: { $month: '$tradeDate' },
          },
          totalPnL: { $sum: '$totalRealizedPnL' },
          tradeCount: { $sum: 1 },
          wins: {
            $sum: {
              $cond: [{ $gt: ['$totalRealizedPnL', 0] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          month: {
            $dateToString: {
              format: '%Y-%m',
              date: {
                $dateFromParts: {
                  year: '$_id.year',
                  month: '$_id.month',
                  day: 1,
                },
              },
            },
          },
          totalPnL: 1,
          tradeCount: 1,
          winRate: {
            $cond: [{ $eq: ['$tradeCount', 0] }, 0, { $divide: ['$wins', '$tradeCount'] }],
          },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ])

    return monthlyData
  }

  /**
   * タグ別成績分析
   */
  async getTagAnalysis(
    startDate?: Date,
    endDate?: Date,
    symbol = 'VIX'
  ): Promise<
    Array<{
      tag: string
      totalPnL: number
      tradeCount: number
      winRate: number
      avgPnL: number
    }>
  > {
    const matchFilter: any = {
      symbol: { $regex: `^${symbol}`, $options: 'i' },
      totalRealizedPnL: { $exists: true, $ne: null },
      positionStatus: { $in: ['CLOSED', 'EXPIRED'] },
      tag: { $exists: true, $ne: null },
    }

    if (startDate || endDate) {
      const dateFilter: any = {}
      if (startDate) dateFilter.$gte = startDate
      if (endDate) dateFilter.$lte = endDate
      matchFilter.tradeDate = dateFilter
    }

    const tagData = await TradeOrder.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$tag',
          totalPnL: { $sum: '$totalRealizedPnL' },
          tradeCount: { $sum: 1 },
          wins: {
            $sum: {
              $cond: [{ $gt: ['$totalRealizedPnL', 0] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          tag: '$_id',
          totalPnL: 1,
          tradeCount: 1,
          winRate: {
            $divide: ['$wins', '$tradeCount'],
          },
          avgPnL: {
            $divide: ['$totalPnL', '$tradeCount'],
          },
        },
      },
      { $sort: { totalPnL: -1 } },
    ])

    return tagData
  }
}
