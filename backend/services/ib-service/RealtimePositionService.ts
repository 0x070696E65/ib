// services/ib-service/RealtimePositionService.ts
import { EventName } from '@stoqey/ib'
import { IbService } from './IbService'
import { Position } from './types'
import EventEmitter from 'events'

export interface PositionWithPnL extends Position {
  dailyPnL?: number
  unrealizedPnL?: number
  realizedPnL?: number
  value?: number
  strike?: number | null
  expiry?: string | null
  optionType?: 'PUT' | 'CALL' | null
}

export interface MarketStatus {
  isOpen: boolean
  nextOpen?: Date
  nextClose?: Date
}

export class RealtimePositionService extends EventEmitter {
  private positions: Map<string, PositionWithPnL> = new Map()
  private pnlSubscriptions: Set<number> = new Set()
  private monitoringInterval?: NodeJS.Timeout
  private isMonitoring: boolean = false
  private marketStatus: MarketStatus = { isOpen: false }

  constructor(private ibService: IbService) {
    super()
    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    // ポジションイベント
    this.ibService.getIbApi().on(EventName.position as any, this.onPosition.bind(this) as any)
    this.ibService.getIbApi().on(EventName.positionEnd, this.onPositionEnd.bind(this))

    // PnLイベント
    this.ibService.getIbApi().on(EventName.pnlSingle as any, this.onPnLSingle.bind(this) as any)

    // エラーハンドリング
    this.ibService.getIbApi().on(EventName.error, this.onError.bind(this))
  }

  private onPosition(accountName: string, contract: any, position: number, avgCost: number): void {
    if (position === 0) return // ポジション0は無視

    const key = `${contract.conId}`
    const positionData: PositionWithPnL = {
      account: accountName,
      symbol: contract.symbol,
      secType: contract.secType,
      exchange: contract.exchange || contract.primaryExch || 'N/A',
      currency: contract.currency,
      position: position,
      avgCost: avgCost,
      marketValue: Math.abs(position * avgCost),
      contractId: contract.conId,
      localSymbol: contract.localSymbol,
    }

    // オプション情報を抽出
    if (contract.secType === 'OPT' && contract.localSymbol) {
      positionData.strike = this.extractStrikeFromLocalSymbol(contract.localSymbol)
      positionData.expiry = this.extractExpiryFromLocalSymbol(contract.localSymbol)
      positionData.optionType = this.extractOptionType(contract.localSymbol)
    }

    this.positions.set(key, positionData)
  }

  private onPositionEnd(): void {
    // ポジション更新完了
    this.emit('positionsUpdated', Array.from(this.positions.values()))
  }

  private onPnLSingle(
    reqId: number,
    pos: number,
    dailyPnL: number,
    unrealizedPnL: number,
    realizedPnL: number,
    value: number
  ): void {
    const request = this.ibService.getPendingRequest(reqId)
    if (!request || !request.contractId) return

    const key = `${request.contractId}`
    const position = this.positions.get(key)

    if (position) {
      position.dailyPnL = dailyPnL
      position.unrealizedPnL = unrealizedPnL
      position.realizedPnL = realizedPnL
      position.value = value

      this.positions.set(key, position)

      // 個別ポジションPnL更新イベント
      this.emit('pnlUpdated', {
        contractId: request.contractId,
        ...position,
      })
    }
  }

  private onError(error: Error, code: number, reqId?: number): void {
    console.warn(`リアルタイム監視エラー (Code: ${code}):`, error.message)

    if (code >= 500) {
      this.emit('connectionError', { error, code })
    }
  }

  /**
   * リアルタイム監視を開始
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) return

    try {
      await this.ibService.connect()
      this.isMonitoring = true

      // 初回ポジション取得
      await this.refreshPositions()

      // 定期更新開始（3秒間隔）
      this.monitoringInterval = setInterval(async () => {
        // 市場時間関係なく常にポジション取得
        await this.refreshPositions()
      }, 3000)

      this.emit('monitoringStarted')
      console.log('リアルタイム監視を開始しました')
    } catch (error) {
      this.emit('error', error)
      throw error
    }
  }

  /**
   * 監視を停止
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) return

    this.isMonitoring = false

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = undefined
    }

    // PnL購読を停止
    for (const reqId of this.pnlSubscriptions) {
      this.ibService.getIbApi().cancelPnLSingle(reqId)
    }
    this.pnlSubscriptions.clear()

    this.emit('monitoringStopped')
    console.log('リアルタイム監視を停止しました')
  }

  /**
   * ポジション情報を更新
   */
  private async refreshPositions(): Promise<void> {
    try {
      // ポジション情報をリクエスト（市場時間関係なく常に取得）
      this.ibService.getIbApi().reqPositions()

      // 既存のPnL購読をクリア
      for (const reqId of this.pnlSubscriptions) {
        this.ibService.getIbApi().cancelPnLSingle(reqId)
      }
      this.pnlSubscriptions.clear()

      // 各ポジションのPnLを購読（市場時間関係なく常に実行）
      setTimeout(() => {
        this.subscribeToAllPnL()
      }, 1000) // ポジション取得完了を待つ

      // 市場状況を更新して通知
      this.updateMarketStatus()
      if (!this.marketStatus.isOpen) {
        this.emit('marketClosed', this.marketStatus)
      }
    } catch (error) {
      this.emit('error', error)
    }
  }

  /**
   * すべてのポジションのPnLを購読
   */
  private subscribeToAllPnL(): void {
    for (const position of this.positions.values()) {
      if (position.contractId) {
        const reqId = this.ibService.getNextRequestId()

        this.ibService.addPendingRequest(reqId, {
          type: 'pnlSingle',
          contractId: position.contractId,
          account: position.account,
        })

        this.ibService.getIbApi().reqPnLSingle(reqId, position.account, '', position.contractId)
        this.pnlSubscriptions.add(reqId)
      }
    }
  }

  /**
   * 現在のポジション一覧を取得（静的API用）
   */
  getCurrentPositions(): PositionWithPnL[] {
    return Array.from(this.positions.values())
  }

  /**
   * 市場状況を確認
   */
  private isMarketOpen(): boolean {
    const now = new Date()
    const currentTime = now.getHours() * 100 + now.getMinutes()
    const day = now.getDay()

    // 土日は閉場
    if (day === 0 || day === 6) {
      this.marketStatus.isOpen = false
      return false
    }

    // 平日の取引時間（EST基準で大まかに）
    // VIXオプションは通常の株式市場時間
    const marketOpen = 930 // 9:30
    const marketClose = 1600 // 16:00

    this.marketStatus.isOpen = currentTime >= marketOpen && currentTime < marketClose
    return this.marketStatus.isOpen
  }

  /**
   * 市場状況を更新
   */
  private updateMarketStatus(): void {
    this.marketStatus.isOpen = this.isMarketOpen()
    // 次回開場時間の計算は簡略化
  }

  /**
   * 監視状態を取得
   */
  getStatus(): {
    isMonitoring: boolean
    positionCount: number
    pnlSubscriptions: number
    marketStatus: MarketStatus
  } {
    return {
      isMonitoring: this.isMonitoring,
      positionCount: this.positions.size,
      pnlSubscriptions: this.pnlSubscriptions.size,
      marketStatus: this.marketStatus,
    }
  }

  // オプション情報抽出メソッド
  private extractStrikeFromLocalSymbol(localSymbol: string): number | null {
    if (!localSymbol) return null
    const match = localSymbol.match(/([CP])(\d{8})$/)
    if (match) {
      return parseInt(match[2]) / 1000
    }
    return null
  }

  private extractExpiryFromLocalSymbol(localSymbol: string): string | null {
    if (!localSymbol) return null
    const match = localSymbol.match(/\s+(\d{6})[CP]/)
    if (match) {
      return `20${match[1]}` // 20250917 形式
    }
    return null
  }

  private extractOptionType(localSymbol: string): 'PUT' | 'CALL' | null {
    if (!localSymbol) return null
    const match = localSymbol.match(/([CP])\d{8}$/)
    if (match) {
      return match[1] === 'P' ? 'PUT' : 'CALL'
    }
    return null
  }
}
