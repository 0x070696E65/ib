// services/FlexQueryService.ts
import axios from 'axios'
import * as xml2js from 'xml2js'

export interface FlexExecution {
  accountId: string
  symbol: string
  description: string
  secType: string
  multiplier?: number
  strike?: number
  expiry?: string
  putCall?: string

  tradeDate: string
  tradeTime: string
  quantity: number
  price: number
  amount: number
  proceeds: number

  ibCommission: number
  ibCommissionCurrency: string
  netCash: number

  buySell: string // 'BUY' or 'SELL'
  exchange: string
  orderID: number
  execID: string

  openCloseIndicator?: string
  fifoPnlRealized?: number
}

export class FlexQueryService {
  private readonly baseUrl = 'https://gdcdyn.interactivebrokers.com/Universal/servlet'

  constructor(private readonly token: string, private readonly queryId: string) {}

  /**
   * 約定履歴を取得（過去指定期間）
   */
  async getExecutionHistory(days: number = 30): Promise<FlexExecution[]> {
    console.log(`Flex Query で過去${days}日の約定履歴を取得中...`)

    try {
      // 1. レポート生成をリクエスト
      const requestId = await this.requestReport()
      console.log(`レポート生成リクエストID: ${requestId}`)

      // 2. レポート生成完了まで待機
      const reportData = await this.waitForReport(requestId)
      console.log(`レポートデータ取得完了: ${reportData.length} 文字`)

      // 3. XMLパース
      const executions = await this.parseFlexReport(reportData)
      console.log(`約定履歴解析完了: ${executions.length}件`)

      // 4. 指定期間でフィルター
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - days)

      const filteredExecutions = executions.filter((exec) => {
        const tradeDate = new Date(exec.tradeDate)
        return tradeDate >= cutoffDate
      })

      console.log(`期間フィルター後: ${filteredExecutions.length}件 (過去${days}日)`)

      return filteredExecutions
    } catch (error) {
      console.error('Flex Query エラー:', error)
      throw error
    }
  }

  /**
   * レポート生成をリクエスト
   */
  private async requestReport(): Promise<string> {
    const url = `${this.baseUrl}/FlexStatementService.SendRequest`

    const params = {
      t: this.token,
      q: this.queryId,
      v: '3',
    }

    console.log('📤 Flex Query レポート生成リクエスト...')

    const response = await axios.get(url, { params })

    const parser = new xml2js.Parser()
    const result = await parser.parseStringPromise(response.data)

    if (result.FlexStatementResponse.Status[0] !== 'Success') {
      throw new Error(`Flex Query リクエスト失敗: ${result.FlexStatementResponse.ErrorMessage?.[0]}`)
    }

    return result.FlexStatementResponse.ReferenceCode[0]
  }

  /**
   * レポート生成完了を待機してデータを取得
   */
  private async waitForReport(requestId: string, maxWaitMinutes: number = 5): Promise<string> {
    const url = `${this.baseUrl}/FlexStatementService.GetStatement`
    const maxAttempts = maxWaitMinutes * 2 // 30秒間隔で試行

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`📥 レポート取得試行 ${attempt}/${maxAttempts}...`)

      try {
        const params = {
          t: this.token,
          q: requestId,
          v: '3',
        }

        const response = await axios.get(url, { params })

        const parser = new xml2js.Parser()
        const result = await parser.parseStringPromise(response.data)

        // デバッグ用ログ
        console.log('レスポンス構造:', Object.keys(result))

        // 成功時は FlexQueryResponse、エラー時は FlexStatementResponse
        if (result.FlexQueryResponse) {
          // データ取得成功
          console.log('✅ レポートデータ取得完了')
          return response.data
        } else if (result.FlexStatementResponse) {
          const status = result.FlexStatementResponse.Status?.[0]
          const errorMsg = result.FlexStatementResponse.ErrorMessage?.[0]

          if (status === 'Success') {
            return response.data
          } else if (status === 'Warn') {
            console.log(`  ⏱️  レポート生成中... (${errorMsg})`)
          } else {
            throw new Error(`レポート取得エラー: ${errorMsg}`)
          }
        } else {
          console.log('予期しないレスポンス構造:', result)
          throw new Error('予期しないレスポンス形式')
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.warn(`  ⚠️  試行 ${attempt} 失敗:`, errorMessage)
      }

      if (attempt < maxAttempts) {
        console.log('  ⏳ 30秒待機...')
        await new Promise((resolve) => setTimeout(resolve, 30000))
      }
    }

    throw new Error(`レポート取得タイムアウト (${maxWaitMinutes}分)`)
  }

  /**
   * Flex Report XMLをパースして約定履歴に変換
   */
  private async parseFlexReport(xmlData: string): Promise<FlexExecution[]> {
    const parser = new xml2js.Parser()
    const result = await parser.parseStringPromise(xmlData)

    console.log('📊 XML構造を解析中...')

    // FlexQueryResponse構造を確認
    if (!result.FlexQueryResponse || !result.FlexQueryResponse.FlexStatements) {
      console.log('レスポンス構造:', JSON.stringify(result, null, 2))
      throw new Error('FlexQueryResponse構造が見つかりません')
    }

    const statement = result.FlexQueryResponse.FlexStatements[0].FlexStatement[0]

    // 期間情報を表示
    const attr = statement.$
    console.log(`期間: ${attr.fromDate} ～ ${attr.toDate} (${attr.period})`)
    console.log(`生成日時: ${attr.whenGenerated}`)

    // Tradesセクションを確認
    if (!statement.Trades || statement.Trades.length === 0) {
      console.log('❌ Tradesセクションが見つかりません')
      console.log('利用可能なセクション:', Object.keys(statement))
      return []
    }

    // Trade配列を取得
    const trades = statement.Trades[0]?.Trade || []

    if (typeof trades === 'string' || trades.length === 0) {
      console.log(`📝 指定期間に取引データはありません (期間: ${attr.fromDate} ～ ${attr.toDate})`)
      return []
    }

    console.log(`XMLパース: ${trades.length}件の取引を発見`)

    return trades.map((trade: any) => {
      const attr = trade.$

      return {
        accountId: attr.accountId,
        symbol: attr.symbol,
        description: attr.description,
        secType: attr.assetCategory,
        multiplier: attr.multiplier ? parseFloat(attr.multiplier) : undefined,
        strike: attr.strike ? parseFloat(attr.strike) : undefined,
        expiry: attr.expiry,
        putCall: attr.putCall,

        tradeDate: attr.tradeDate,
        tradeTime: attr.dateTime,
        quantity: parseFloat(attr.quantity),
        price: parseFloat(attr.tradePrice),
        amount: parseFloat(attr.tradeMoney),
        proceeds: parseFloat(attr.proceeds),

        ibCommission: parseFloat(attr.ibCommission),
        ibCommissionCurrency: attr.ibCommissionCurrency,
        netCash: parseFloat(attr.netCash),

        buySell: attr.buySell,
        exchange: attr.exchange,
        orderID: parseInt(attr.ibOrderID),
        execID: attr.ibExecID,

        openCloseIndicator: attr.openCloseIndicator,
        fifoPnlRealized: attr.fifoPnlRealized ? parseFloat(attr.fifoPnlRealized) : undefined,
      } as FlexExecution
    })
  }

  /**
   * VIXオプション約定のみフィルター
   */
  filterVixOptions(executions: FlexExecution[]): FlexExecution[] {
    return executions.filter((exec) => exec.symbol === 'VIX' && exec.secType === 'OPT')
  }

  /**
   * 約定を日付でソート
   */
  sortByDate(executions: FlexExecution[], ascending: boolean = false): FlexExecution[] {
    return executions.sort((a, b) => {
      const dateA = new Date(`${a.tradeDate} ${a.tradeTime}`)
      const dateB = new Date(`${b.tradeDate} ${b.tradeTime}`)
      return ascending ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime()
    })
  }

  /**
   * 約定統計を計算
   */
  calculateStats(executions: FlexExecution[]) {
    const stats = {
      totalTrades: executions.length,
      totalCommission: executions.reduce((sum, exec) => sum + Math.abs(exec.ibCommission), 0),
      totalPnL: executions.reduce((sum, exec) => sum + (exec.fifoPnlRealized || 0), 0),
      buyTrades: executions.filter((exec) => exec.buySell === 'BUY').length,
      sellTrades: executions.filter((exec) => exec.buySell === 'SELL').length,

      bySymbol: {} as Record<string, number>,
      bySecType: {} as Record<string, number>,
    }

    executions.forEach((exec) => {
      stats.bySymbol[exec.symbol] = (stats.bySymbol[exec.symbol] || 0) + 1
      stats.bySecType[exec.secType] = (stats.bySecType[exec.secType] || 0) + 1
    })

    return stats
  }
}

// ファクトリー関数
export function createFlexQueryService(token: string, queryId: string): FlexQueryService {
  return new FlexQueryService(token, queryId)
}
