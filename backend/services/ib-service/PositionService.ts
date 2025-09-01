// services/ib-service/PositionService.ts
import { EventName } from '@stoqey/ib'
import { IbService } from './IbService'
import { Position, PositionSummary } from './types'

declare module '@stoqey/ib' {
  interface IBApi {
    on(event: 'position', listener: (account: string, contract: any, position: number, avgCost: number) => void): this
  }
}

export class PositionService {
  constructor(private ibService: IbService) {}

  /**
   * 現在のポジション情報を取得
   * @returns Promise<Position[]> ポジション配列
   */
  async getCurrentPositions(): Promise<Position[]> {
    await this.ibService.connect()

    return new Promise((resolve, reject) => {
      const positions: Position[] = []
      let positionsReceived = false

      // ポジションデータ受信イベント
      const onPosition = (accountName: string, contract: any, position: number, avgCost: number) => {
        if (position !== 0) {
          // ポジションが0でない場合のみ
          positions.push({
            account: accountName,
            symbol: contract.symbol,
            secType: contract.secType,
            exchange: contract.exchange || contract.primaryExch || 'N/A',
            currency: contract.currency,
            position: position,
            avgCost: avgCost,
            marketValue: Math.abs(position * avgCost), // 概算市場価値
            contractId: contract.conId,
            localSymbol: contract.localSymbol,
          })
        }
      }

      // ポジション受信完了イベント
      const onPositionEnd = () => {
        if (!positionsReceived) {
          positionsReceived = true
          this.ibService.getIbApi().off(EventName.position, onPosition)
          this.ibService.getIbApi().off(EventName.positionEnd, onPositionEnd)
          this.ibService.getIbApi().off(EventName.error, onError)
          console.log(`ポジション取得完了: ${positions.length}件`)
          resolve(positions)
        }
      }

      // エラーハンドリング
      const onError = (error: Error, code: number, reqId?: number) => {
        if (!positionsReceived && code >= 500) {
          positionsReceived = true
          this.ibService.getIbApi().off(EventName.position, onPosition)
          this.ibService.getIbApi().off(EventName.positionEnd, onPositionEnd)
          this.ibService.getIbApi().off(EventName.error, onError)
          console.error(`ポジション取得エラー (Code: ${code}):`, error.message)
          reject(new Error(`ポジション取得エラー (Code: ${code}): ${error.message}`))
        }
      }

      // イベントリスナー登録
      this.ibService.getIbApi().on(EventName.position, onPosition)
      this.ibService.getIbApi().on(EventName.positionEnd, onPositionEnd)
      this.ibService.getIbApi().on(EventName.error, onError)

      // タイムアウト処理
      setTimeout(() => {
        if (!positionsReceived) {
          positionsReceived = true
          this.ibService.getIbApi().off(EventName.position, onPosition)
          this.ibService.getIbApi().off(EventName.positionEnd, onPositionEnd)
          this.ibService.getIbApi().off(EventName.error, onError)
          console.warn('ポジション取得タイムアウト')
          resolve(positions) // タイムアウトでも現在までのポジションを返す
        }
      }, 15000)

      console.log('ポジション情報をリクエスト中...')
      this.ibService.getIbApi().reqPositions()
    })
  }

  /**
   * 特定のシンボルのポジションのみを取得
   * @param symbol シンボル名 (例: 'VIX', 'SPY')
   * @returns Promise<Position[]> 該当するポジション配列
   */
  async getPositionsBySymbol(symbol: string): Promise<Position[]> {
    const allPositions = await this.getCurrentPositions()
    return allPositions.filter((pos) => pos.symbol === symbol)
  }

  /**
   * アカウント別のポジションサマリーを取得
   * @returns Promise<{[account: string]: Position[]}> アカウント別ポジション
   */
  async getPositionsByAccount(): Promise<{ [account: string]: Position[] }> {
    const allPositions = await this.getCurrentPositions()
    const positionsByAccount: { [account: string]: Position[] } = {}

    allPositions.forEach((position) => {
      if (!positionsByAccount[position.account]) {
        positionsByAccount[position.account] = []
      }
      positionsByAccount[position.account].push(position)
    })

    return positionsByAccount
  }

  /**
   * ポジションの統計情報を取得
   * @returns Promise<PositionSummary> ポジション統計
   */
  async getPositionSummary(): Promise<PositionSummary> {
    const positions = await this.getCurrentPositions()

    const longPositions = positions.filter((pos) => pos.position > 0)
    const shortPositions = positions.filter((pos) => pos.position < 0)
    const totalMarketValue = positions.reduce((sum, pos) => sum + (pos.marketValue || 0), 0)
    const accounts = [...new Set(positions.map((pos) => pos.account))]
    const symbols = [...new Set(positions.map((pos) => pos.symbol))]

    return {
      totalPositions: positions.length,
      totalMarketValue,
      longPositions: longPositions.length,
      shortPositions: shortPositions.length,
      accounts,
      symbols,
    }
  }

  /**
   * VIXオプションポジションのみを取得
   * @returns Promise<Position[]> VIXオプションポジション配列
   */
  async getVixOptionPositions(): Promise<Position[]> {
    const allPositions = await this.getCurrentPositions()
    return allPositions.filter((pos) => pos.symbol === 'VIX' && pos.secType === 'OPT')
  }

  /**
   * VIX先物ポジションのみを取得
   * @returns Promise<Position[]> VIX先物ポジション配列
   */
  async getVixFuturePositions(): Promise<Position[]> {
    const allPositions = await this.getCurrentPositions()
    return allPositions.filter((pos) => pos.symbol === 'VIX' && pos.secType === 'FUT')
  }

  // ローカルシンボルからストライク価格を抽出
  public extractStrikeFromLocalSymbol(localSymbol: string): number | null {
    if (!localSymbol) return null

    // VIXオプションのローカルシンボル形式: "VIX   250917P00020000"
    // 最後の8桁がストライク価格（1000倍されている）
    const match = localSymbol.match(/([CP])(\d{8})$/)
    if (match) {
      const strikeRaw = match[2]
      return parseInt(strikeRaw) / 1000
    }
    return null
  }

  // 満期日を抽出
  public extractExpiryFromLocalSymbol(localSymbol: string): string | null {
    if (!localSymbol) return null

    // VIXオプションのローカルシンボル形式: "VIX   250917P00020000"
    // 6桁の日付部分
    const match = localSymbol.match(/\s+(\d{6})[CP]/)
    if (match) {
      return match[1] // "250917"
    }
    return null
  }

  // プット/コールを判定
  public extractOptionType(localSymbol: string): 'PUT' | 'CALL' | null {
    if (!localSymbol) return null

    const match = localSymbol.match(/([CP])\d{8}$/)
    if (match) {
      return match[1] === 'P' ? 'PUT' : 'CALL'
    }
    return null
  }
}
