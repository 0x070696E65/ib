// backend/services/AggregatedTradeService.ts
import { TradeOrder } from '../../models/TradeOrder'
import { FlexExecution, createFlexQueryService } from './FlexQueryService'
import { extractOptionInfo } from '../../utils/util'
interface AggregatedExecution {
  orderID: number
  executions: FlexExecution[]
}

export class AggregatedTradeService {
  constructor() {}

  /**
   * Flex Query データをorderID単位で集約してMongoDBに保存
   */
  async importAndAggregateFlexExecutions(): Promise<{ imported: number; skipped: number }> {
    console.log('Flex Query データの集約インポートを開始...')

    const flexService = createFlexQueryService(process.env.IB_FLEX_TOKEN!, process.env.IB_FLEX_QUERY_ID!)

    try {
      // 過去1年のデータを取得
      const flexExecutions = await flexService.getExecutionHistory(365)
      console.log(`${flexExecutions.length}件の約定を取得`)

      // orderID単位でグループ化
      const groupedByOrder = this.groupExecutionsByOrderId(flexExecutions)
      console.log(`${groupedByOrder.length}件の発注単位に集約`)

      let imported = 0
      let skipped = 0

      for (const group of groupedByOrder) {
        try {
          // 既存データをチェック
          const existing = await TradeOrder.findOne({ orderID: group.orderID })

          if (existing) {
            skipped++
            continue
          }

          // 集約データを作成
          const aggregatedOrder = this.aggregateExecutions(group.executions)

          if (!aggregatedOrder) {
            console.warn(`orderID ${group.orderID} の集約に失敗`)
            continue
          }

          // MongoDB に保存
          const tradeOrder = new TradeOrder(aggregatedOrder)
          await tradeOrder.save()
          imported++
        } catch (error) {
          console.error(`orderID ${group.orderID} の保存エラー:`, error)
        }
      }

      // クローズ状態の更新
      await this.updateClosedOrders()

      return { imported, skipped }
    } catch (error) {
      console.error('集約インポートエラー:', error)
      throw error
    }
  }

  /**
   * orderID単位でグループ化
   */
  private groupExecutionsByOrderId(executions: FlexExecution[]): AggregatedExecution[] {
    const grouped = new Map<number, FlexExecution[]>()

    executions.forEach((exec) => {
      if (exec.orderID) {
        if (!grouped.has(exec.orderID)) {
          grouped.set(exec.orderID, [])
        }
        grouped.get(exec.orderID)!.push(exec)
      }
    })

    return Array.from(grouped.entries()).map(([orderID, executions]) => ({
      orderID,
      executions: executions.sort(
        (a, b) =>
          new Date(`${a.tradeDate} ${a.tradeTime}`).getTime() - new Date(`${b.tradeDate} ${b.tradeTime}`).getTime()
      ),
    }))
  }

  /**
   * 複数約定を1つの発注に集約
   */
  private aggregateExecutions(executions: FlexExecution[]): any | null {
    if (executions.length === 0) return null

    const first = executions[0]

    // 数量加重平均価格を計算
    const totalQuantity = executions.reduce((sum, exec) => sum + Math.abs(exec.quantity), 0)
    const totalAmount = executions.reduce((sum, exec) => sum + Math.abs(exec.amount), 0)
    const avgPrice = totalQuantity > 0 ? totalAmount / totalQuantity : 0

    // 手数料とPnLを合算
    const totalCommission = executions.reduce((sum, exec) => sum + Math.abs(exec.ibCommission), 0)
    const totalNetCash = executions.reduce((sum, exec) => sum + exec.netCash, 0)
    const totalRealizedPnL = executions.reduce((sum, exec) => sum + (exec.fifoPnlRealized || 0), 0)
    const totalProceeds = executions.reduce((sum, exec) => sum + exec.proceeds, 0)

    // 実際の発注数量（符号を考慮）
    const signedQuantity = executions.reduce((sum, exec) => sum + exec.quantity, 0)

    // putCall の正規化
    let putCall: 'P' | 'C' | undefined = undefined
    if (first.putCall && first.putCall.trim() !== '') {
      const normalized = first.putCall.toUpperCase().trim()
      if (normalized === 'P' || normalized === 'PUT') {
        putCall = 'P'
      } else if (normalized === 'C' || normalized === 'CALL') {
        putCall = 'C'
      }
    }

    return {
      accountId: first.accountId,
      symbol: first.symbol,
      secType: first.secType,
      description: first.description,

      strike: first.strike || undefined,
      expiry: first.expiry || undefined,
      putCall: putCall,
      multiplier: first.multiplier || undefined,

      orderID: first.orderID,
      tradeDate: new Date(first.tradeDate),
      firstExecutionTime: first.tradeTime,
      totalQuantity: Math.abs(signedQuantity), // 絶対値で保存
      avgPrice: avgPrice,
      totalAmount: totalAmount,
      totalProceeds: totalProceeds,
      buySell: signedQuantity > 0 ? 'BUY' : 'SELL', // 符号で売買判定
      exchange: first.exchange || undefined,

      totalCommission: totalCommission,
      commissionCurrency: first.ibCommissionCurrency || undefined,
      totalNetCash: totalNetCash,
      totalRealizedPnL: totalRealizedPnL !== 0 ? totalRealizedPnL : undefined,

      execIDs: executions.map((exec) => exec.execID || '').filter((id) => id.trim() !== ''), // 空のexecIDを除外
      executionDetails: executions.map((exec) => ({
        execID: exec.execID && exec.execID.trim() !== '' ? exec.execID : undefined,
        time: exec.tradeTime,
        quantity: exec.quantity,
        price: exec.price,
        commission: Math.abs(exec.ibCommission),
      })),

      dataSource: 'FLEX_QUERY',
    }
  }

  /**
   * クローズ済み発注の状態を更新
   */
  private async updateClosedOrders(): Promise<void> {
    console.log('クローズ済み発注の状態を更新中...')

    const openOrders = await TradeOrder.find({ positionStatus: 'OPEN' })

    for (const order of openOrders) {
      // 同一オプションで逆方向の発注を検索
      const oppositeOrders = await TradeOrder.find({
        symbol: order.symbol,
        expiry: order.expiry,
        strike: order.strike,
        putCall: order.putCall,
        buySell: order.buySell === 'BUY' ? 'SELL' : 'BUY',
        tradeDate: { $gte: order.tradeDate },
      }).sort({ tradeDate: 1 })

      let remainingQuantity = order.totalQuantity

      for (const oppositeOrder of oppositeOrders) {
        if (remainingQuantity <= 0) break

        const closeQuantity = Math.min(remainingQuantity, oppositeOrder.totalQuantity)
        remainingQuantity -= closeQuantity

        if (remainingQuantity === 0) {
          order.positionStatus = 'CLOSED'
          order.closeDate = oppositeOrder.tradeDate
          await order.save()

          console.log(`発注 ${order.orderID} (${order.symbol} ${order.strike}${order.putCall}) をクローズ済みに更新`)
          break
        }
      }

      // 満期チェック
      if (order.expiry && remainingQuantity > 0) {
        const expiryDate = new Date(order.expiry)
        const now = new Date()

        if (now > expiryDate) {
          order.positionStatus = 'EXPIRED'
          order.closeDate = expiryDate
          await order.save()

          console.log(`発注 ${order.orderID} (${order.symbol} ${order.strike}${order.putCall}) を期限切れに更新`)
        }
      }
    }
  }

  /**
   * 集約された取引データで分析を実行
   */
  async getAnalysisData(): Promise<{
    byTag: Record<string, { count: number; totalPnL: number; avgPnL: number }>
    summary: { totalOrders: number; totalPnL: number; winRate: number }
  }> {
    // タグ別分析（クローズ済みのみ）
    const tagAnalysis = await TradeOrder.aggregate([
      { $match: { positionStatus: 'CLOSED', tag: { $exists: true } } },
      {
        $group: {
          _id: '$tag',
          count: { $sum: 1 },
          totalPnL: { $sum: '$totalRealizedPnL' },
          avgPnL: { $avg: '$totalRealizedPnL' },
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

    // 全体サマリー
    const summary = await TradeOrder.aggregate([
      { $match: { positionStatus: 'CLOSED', totalRealizedPnL: { $exists: true } } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalPnL: { $sum: '$totalRealizedPnL' },
          winningOrders: {
            $sum: { $cond: [{ $gt: ['$totalRealizedPnL', 0] }, 1, 0] },
          },
        },
      },
    ])

    const summaryData = summary[0] || { totalOrders: 0, totalPnL: 0, winningOrders: 0 }
    const winRate = summaryData.totalOrders > 0 ? (summaryData.winningOrders / summaryData.totalOrders) * 100 : 0

    return {
      byTag,
      summary: {
        totalOrders: summaryData.totalOrders,
        totalPnL: summaryData.totalPnL,
        winRate,
      },
    }
  }

  /**
   * リアルタイムポジションとマッチング
   */
  async matchPositionsWithOrders(positions: any[]): Promise<any[]> {
    const results = []

    for (const position of positions) {
      const optionInfo = extractOptionInfo(position.localSymbol)
      if (position.secType !== 'OPT' || !optionInfo.strike || !optionInfo.expiry) {
        results.push({ matched: false, position })
        continue
      }

      const matchingOrder = await TradeOrder.findOne({
        strike: optionInfo.strike,
        expiry: optionInfo.expiry,
        putCall: 'P',
        positionStatus: 'OPEN',
      })

      if (matchingOrder) {
        results.push({
          matched: true,
          tradeOrder: matchingOrder,
          position,
        })
      } else {
        results.push({ matched: false, position })
      }
    }

    return results
  }

  /**
   * expiry フォーマット変換: "250917" → "20250917"
   */
  private convertExpiryToFullFormat(expiry: string): string {
    if (!expiry) return ''

    // 既に8桁の場合はそのまま
    if (expiry.length === 8) {
      return expiry
    }

    // 6桁の場合は先頭に"20"を追加
    if (expiry.length === 6) {
      return `20${expiry}`
    }

    // ハイフン形式の場合は変換
    if (expiry.includes('-')) {
      return expiry.replace(/-/g, '')
    }

    return expiry
  }

  /**
   * 満期日フォーマットの統一（既存メソッドを更新）
   */
  private formatExpiry(expiry: string): string {
    return this.convertExpiryToFullFormat(expiry)
  }

  /**
   * ポジションの一意キーを生成
   */
  private generatePositionKey(tradeOrder: any): string {
    // symbolからVIXのみ抽出、putCallをオプションタイプに変換
    const baseSymbol = tradeOrder.symbol.startsWith('VIX') ? 'VIX' : tradeOrder.symbol
    const optionType = tradeOrder.putCall === 'P' ? 'PUT' : 'CALL'
    return `${baseSymbol}_${tradeOrder.strike}_${tradeOrder.expiry}_${optionType}`
  }

  /**
   * バンドルを作成（PPタグ）
   */
  async createBundle(bundleRequest: { name: string; positionKeys: string[] }): Promise<any> {
    console.log('Received positionKeys:', bundleRequest.positionKeys)

    // すべてのオープンなTradeOrderを取得
    const tradeOrders = await TradeOrder.find({ positionStatus: 'OPEN' })
    console.log('Found TradeOrders:', tradeOrders.length)

    // 各TradeOrderのpositionKeyを生成してマッチング
    const matchedOrders = tradeOrders.filter((order) => {
      const key = this.generatePositionKey(order)
      console.log('Generated key for order:', key, 'orderID:', order.orderID)
      return bundleRequest.positionKeys.includes(key)
    })

    console.log('Matched orders:', matchedOrders.length)

    if (matchedOrders.length < 2) {
      throw new Error('バンドルには最低2つのポジションが必要です')
    }

    // バンドル情報を準備
    const orderIds: number[] = []
    let symbol = ''
    let expiry: string = ''

    for (const order of matchedOrders) {
      orderIds.push(order.orderID)
      symbol = order.symbol
      if (order.expiry) {
        expiry = order.expiry
      }
    }

    // バンドルIDを生成
    const bundleId = `bundle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // TradeOrderにバンドル情報を更新
    await TradeOrder.updateMany({ orderID: { $in: orderIds } }, { $set: { bundleId, tag: 'PP' } })

    console.log(`バンドル "${bundleRequest.name}" を作成: ${orderIds.length}件の発注`)

    return {
      bundleId,
      name: bundleRequest.name,
      symbol,
      expiry,
      orderCount: orderIds.length,
      orderIds,
    }
  }

  /**
   * 単独ポジションにタグ付け（P+, P-）
   */
  async tagSinglePosition(positionKey: string, tag: 'P+' | 'P-'): Promise<void> {
    console.log('Received positionKey for tagging:', positionKey)

    // positionKeyから直接TradeOrderを検索
    const tradeOrders = await TradeOrder.find({ positionStatus: 'OPEN' })

    const matchedOrder = tradeOrders.find((order) => {
      const key = this.generatePositionKey(order)
      console.log('Generated key for tagging:', key, 'orderID:', order.orderID)
      return key === positionKey
    })

    if (!matchedOrder) {
      throw new Error('ポジションが見つかりません')
    }

    await TradeOrder.findByIdAndUpdate(matchedOrder._id, { $set: { tag } })

    console.log(`OrderID ${matchedOrder.orderID} に ${tag} タグを設定`)
  }
}
