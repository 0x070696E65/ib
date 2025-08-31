// backend/services/TradeDataService.ts
import { TradeExecution, ITradeExecution } from '../../models/TradeExecution'
import { TradeBundle, ITradeBundle } from '../../models/TradeBundle'
import { FlexExecution, createFlexQueryService } from './FlexQueryService'
import { PositionWithPnL } from './RealtimePositionService'
import { v4 as uuidv4 } from 'uuid'

export interface PositionMatchResult {
  matched: boolean
  tradeExecution?: ITradeExecution
  position?: PositionWithPnL
}

export interface BundleRequest {
  name: string
  positionKeys: string[] // リアルタイムポジションの識別キー
}

export class TradeDataService {
  constructor() {}

  /**
   * Flex Query データを MongoDB にインポート
   */
  async importFlexExecutions(): Promise<{ imported: number; skipped: number }> {
    console.log('Flex Query データのインポートを開始...')

    const flexService = createFlexQueryService(process.env.IB_FLEX_TOKEN!, process.env.IB_FLEX_QUERY_ID!)

    try {
      // 過去1年のデータを取得
      const flexExecutions = await flexService.getExecutionHistory(365)
      console.log(`${flexExecutions.length}件の約定を取得`)

      let imported = 0
      let skipped = 0

      for (const flexExec of flexExecutions) {
        try {
          // 既存データをチェック（execID で重複確認）
          const existing = await TradeExecution.findOne({ execID: flexExec.execID })

          if (existing) {
            skipped++
            continue
          }

          // 新規作成
          const tradeExecution = new TradeExecution({
            accountId: flexExec.accountId,
            symbol: flexExec.symbol,
            secType: flexExec.secType,
            description: flexExec.description,

            strike: flexExec.strike,
            expiry: flexExec.expiry,
            putCall: flexExec.putCall,
            multiplier: flexExec.multiplier,

            tradeDate: new Date(flexExec.tradeDate),
            tradeTime: flexExec.tradeTime,
            quantity: flexExec.quantity,
            price: flexExec.price,
            amount: flexExec.amount,
            proceeds: flexExec.proceeds,
            buySell: flexExec.buySell,
            exchange: flexExec.exchange,

            ibCommission: flexExec.ibCommission,
            ibCommissionCurrency: flexExec.ibCommissionCurrency,
            netCash: flexExec.netCash,
            realizedPnL: flexExec.fifoPnlRealized,

            execID: flexExec.execID,
            orderID: flexExec.orderID,

            dataSource: 'FLEX_QUERY',
          })

          await tradeExecution.save()
          imported++
        } catch (error) {
          console.error(`約定 ${flexExec.execID} の保存エラー:`, error)
        }
      }

      // クローズ状態の更新
      await this.updateClosedPositions()

      return { imported, skipped }
    } catch (error) {
      console.error('Flex Query インポートエラー:', error)
      throw error
    }
  }

  /**
   * リアルタイムポジションと約定データをマッチング
   */
  async matchPositionsWithExecutions(positions: PositionWithPnL[]): Promise<PositionMatchResult[]> {
    const results: PositionMatchResult[] = []

    for (const position of positions) {
      // オプションポジションのみ処理
      if (position.secType !== 'OPT' || !position.strike || !position.expiry) {
        results.push({ matched: false, position })
        continue
      }

      // マッチする約定を検索
      const matchingExecution = await TradeExecution.findOne({
        symbol: position.symbol,
        strike: position.strike,
        expiry: this.formatExpiry(position.expiry),
        putCall: position.optionType === 'PUT' ? 'P' : 'C',
        positionStatus: 'OPEN',
      })

      if (matchingExecution) {
        results.push({
          matched: true,
          tradeExecution: matchingExecution,
          position,
        })
      } else {
        results.push({ matched: false, position })
      }
    }

    return results
  }

  /**
   * バンドルを作成（PPタグ）
   */
  async createBundle(bundleRequest: BundleRequest, positions: PositionWithPnL[]): Promise<ITradeBundle> {
    // 選択されたポジションを取得
    const selectedPositions = positions.filter((pos) =>
      bundleRequest.positionKeys.includes(this.generatePositionKey(pos))
    )

    if (selectedPositions.length < 2) {
      throw new Error('バンドルには最低2つのポジションが必要です')
    }

    // 対応する約定を取得
    const executionIds: string[] = []
    let symbol = ''
    let expiry = ''

    for (const position of selectedPositions) {
      const execution = await TradeExecution.findOne({
        symbol: position.symbol,
        strike: position.strike,
        expiry: this.formatExpiry(position.expiry!),
        putCall: position.optionType === 'PUT' ? 'P' : 'C',
        positionStatus: 'OPEN',
      })

      if (execution) {
        const exec = execution as { _id: string; symbol: string; expiry: string | undefined }
        executionIds.push(exec._id.toString())
        symbol = exec.symbol
        expiry = exec.expiry!
      }
    }

    if (executionIds.length === 0) {
      throw new Error('対応する約定データが見つかりません')
    }

    // バンドルを作成
    const bundleId = uuidv4()
    const bundle = new TradeBundle({
      bundleId,
      name: bundleRequest.name,
      tag: 'PP',
      symbol,
      expiry,
      createdDate: new Date(),
      executionIds,
      status: 'OPEN',
    })

    // 集計データを計算
    await this.calculateBundleMetrics(bundle)
    await bundle.save()

    // 各約定にバンドルIDとタグを設定
    await TradeExecution.updateMany(
      { _id: { $in: executionIds } },
      {
        $set: {
          bundleId,
          tag: 'PP',
        },
      }
    )

    console.log(`バンドル "${bundleRequest.name}" を作成: ${executionIds.length}件の約定`)
    return bundle
  }

  /**
   * 単独ポジションにタグ付け（P+, P-）
   */
  async tagSinglePosition(positionKey: string, tag: 'P+' | 'P-', positions: PositionWithPnL[]): Promise<void> {
    const position = positions.find((pos) => this.generatePositionKey(pos) === positionKey)

    if (!position) {
      throw new Error('ポジションが見つかりません')
    }

    // 対応する約定を更新
    const execution = await TradeExecution.findOneAndUpdate(
      {
        symbol: position.symbol,
        strike: position.strike,
        expiry: this.formatExpiry(position.expiry!),
        putCall: position.optionType === 'PUT' ? 'P' : 'C',
        positionStatus: 'OPEN',
      },
      {
        $set: { tag },
      }
    )

    if (!execution) {
      throw new Error('対応する約定データが見つかりません')
    }

    console.log(`ポジション ${position.symbol} ${position.strike}${position.optionType} に ${tag} タグを設定`)
  }

  /**
   * 分析データを取得（クローズ済みのみ）
   */
  async getAnalysisData(): Promise<{
    byTag: Record<string, { count: number; totalPnL: number; avgPnL: number }>
    byBundle: Array<{ bundleId: string; name: string; totalPnL: number; executionCount: number }>
    summary: { totalTrades: number; totalPnL: number; winRate: number }
  }> {
    // タグ別分析
    const tagAnalysis = await TradeExecution.aggregate([
      { $match: { positionStatus: 'CLOSED', tag: { $exists: true } } },
      {
        $group: {
          _id: '$tag',
          count: { $sum: 1 },
          totalPnL: { $sum: '$realizedPnL' },
          avgPnL: { $avg: '$realizedPnL' },
        },
      },
    ])

    const byTag: Record<string, { count: number; totalPnL: number; avgPnL: number }> = {}
    tagAnalysis.forEach((item) => {
      byTag[item._id] = {
        count: item.count,
        totalPnL: item.totalPnL || 0,
        avgPnL: item.avgPnL || 0,
      }
    })

    // バンドル別分析
    const bundleAnalysis = await TradeBundle.aggregate([
      { $match: { status: 'CLOSED' } },
      {
        $project: {
          bundleId: 1,
          name: 1,
          totalPnL: 1,
          executionCount: { $size: '$executionIds' },
        },
      },
    ])

    // 全体サマリー
    const summary = await TradeExecution.aggregate([
      { $match: { positionStatus: 'CLOSED', realizedPnL: { $exists: true } } },
      {
        $group: {
          _id: null,
          totalTrades: { $sum: 1 },
          totalPnL: { $sum: '$realizedPnL' },
          winningTrades: {
            $sum: { $cond: [{ $gt: ['$realizedPnL', 0] }, 1, 0] },
          },
        },
      },
    ])

    const summaryData = summary[0] || { totalTrades: 0, totalPnL: 0, winningTrades: 0 }
    const winRate = summaryData.totalTrades > 0 ? (summaryData.winningTrades / summaryData.totalTrades) * 100 : 0

    return {
      byTag,
      byBundle: bundleAnalysis,
      summary: {
        totalTrades: summaryData.totalTrades,
        totalPnL: summaryData.totalPnL,
        winRate,
      },
    }
  }

  /**
   * クローズ済みポジションの状態を更新
   */
  private async updateClosedPositions(): Promise<void> {
    console.log('クローズ済みポジションの状態を更新中...')

    const openExecutions = await TradeExecution.find({ positionStatus: 'OPEN' })

    for (const execution of openExecutions) {
      // 同一オプションで逆方向の取引を検索
      const oppositeExecutions = await TradeExecution.find({
        symbol: execution.symbol,
        expiry: execution.expiry,
        strike: execution.strike,
        putCall: execution.putCall,
        buySell: execution.buySell === 'BUY' ? 'SELL' : 'BUY',
        tradeDate: { $gte: execution.tradeDate },
      }).sort({ tradeDate: 1 })

      let remainingQuantity = Math.abs(execution.quantity)

      for (const oppositeExec of oppositeExecutions) {
        if (remainingQuantity <= 0) break

        const closeQuantity = Math.min(remainingQuantity, Math.abs(oppositeExec.quantity))
        remainingQuantity -= closeQuantity

        if (remainingQuantity === 0) {
          execution.positionStatus = 'CLOSED'
          execution.closeDate = oppositeExec.tradeDate
          await execution.save()

          // バンドルの状態も更新
          if (execution.bundleId) {
            await this.updateBundleStatus(execution.bundleId)
          }
          break
        }
      }

      // 満期チェック
      if (execution.expiry && remainingQuantity > 0) {
        const expiryDate = new Date(execution.expiry)
        const now = new Date()

        if (now > expiryDate) {
          execution.positionStatus = 'EXPIRED'
          execution.closeDate = expiryDate
          await execution.save()

          if (execution.bundleId) {
            await this.updateBundleStatus(execution.bundleId)
          }
        }
      }
    }
  }

  /**
   * バンドルのメトリクスを計算
   */
  private async calculateBundleMetrics(bundle: ITradeBundle): Promise<void> {
    const executions = await TradeExecution.find({
      _id: { $in: bundle.executionIds },
    })

    bundle.totalQuantity = executions.reduce((sum, exec) => sum + Math.abs(exec.quantity), 0)
    bundle.totalPnL = executions.reduce((sum, exec) => sum + (exec.realizedPnL || 0), 0)

    const totalAmount = executions.reduce((sum, exec) => sum + Math.abs(exec.amount), 0)
    bundle.averagePrice = bundle.totalQuantity > 0 ? totalAmount / bundle.totalQuantity : 0
  }

  /**
   * バンドルの状態を更新
   */
  private async updateBundleStatus(bundleId: string): Promise<void> {
    const bundle = await TradeBundle.findOne({ bundleId })
    if (!bundle) return

    const executions = await TradeExecution.find({
      _id: { $in: bundle.executionIds },
    })

    const allClosed = executions.every((exec) => exec.positionStatus === 'CLOSED' || exec.positionStatus === 'EXPIRED')

    if (allClosed) {
      bundle.status = 'CLOSED'
      await this.calculateBundleMetrics(bundle)
      await bundle.save()
    }
  }

  /**
   * ポジションの一意キーを生成
   */
  private generatePositionKey(position: PositionWithPnL): string {
    return `${position.symbol}_${position.strike}_${position.expiry}_${position.optionType}`
  }

  /**
   * 満期日フォーマットの統一
   */
  private formatExpiry(expiry: string): string {
    // "20250917" 形式に統一
    if (expiry.includes('-')) {
      return expiry.replace(/-/g, '')
    }
    return expiry
  }
}
