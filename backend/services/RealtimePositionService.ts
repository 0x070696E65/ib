// services/RealtimePositionService.ts
import { EventName } from '@stoqey/ib'
import { IbService } from './IbService'
import { Position } from './types'
import EventEmitter from 'events'
import { extractOptionInfo } from '../utils/util'
export interface PositionWithPnL extends Position {
  dailyPnL?: number
  unrealizedPnL?: number
  realizedPnL?: number
  value?: number
  strike?: number | null
  expiry?: string | null
  mark?: number
  optionType?: 'PUT' | 'CALL' | null
}

export interface MarketStatus {
  isOpen: boolean
  nextOpen?: Date
  nextClose?: Date
}

export class RealtimePositionService extends EventEmitter {
  private positions: Map<string, PositionWithPnL> = new Map()
  private pnlSubscriptions: Map<number, number> = new Map() // reqId -> contractId
  private activeSubscriptions: Set<number> = new Set()
  private pnlErrorsLogged: Set<number> = new Set() // contractIds where error was already logged
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
    this.ibService.getIbApi().on(EventName.pnl as any, this.onPnL.bind(this) as any)
    this.ibService.getIbApi().on(EventName.pnlSingle as any, this.onPnLSingle.bind(this) as any)

    // エラーハンドリング
    this.ibService.getIbApi().on(EventName.error, this.onError.bind(this))
  }

  private onPosition(accountName: string, contract: any, position: number, avgCost: number): void {
    if (position === 0) {
      const key = `${contract.conId}`
      if (this.positions.has(key)) {
        this.positions.delete(key)
        this.unsubscribeFromPnL(contract.conId)
      }
      return
    }

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
      const optionInfo = extractOptionInfo(contract.localSymbol)
      positionData.strike = optionInfo.strike
      positionData.expiry = optionInfo.expiry
      positionData.optionType = optionInfo.optionType
    }

    this.positions.set(key, positionData)
  }

  private onPositionEnd(): void {
    this.emit('positionsUpdated', Array.from(this.positions.values()))

    // 監視中の場合のみPnL購読
    if (this.isMonitoring) {
      setTimeout(() => {
        this.subscribeToAllPnL()
      }, 1000)
    }
  }

  private onPnL(reqId: number, dailyPnL: number, unrealizedPnL: number, realizedPnL: number): void {
    console.log(`Account PnL Update: dailyPnL=${dailyPnL}, unrealizedPnL=${unrealizedPnL}, realizedPnL=${realizedPnL}`)

    // 市場状況を判定（dailyPnLが0の場合は市場時間外と推定）
    this.marketStatus.isOpen = dailyPnL !== 0

    this.emit('accountPnlUpdated', {
      dailyPnL,
      unrealizedPnL,
      realizedPnL,
    })
  }

  private onPnLSingle(
    reqId: number,
    pos: number,
    dailyPnL: number,
    unrealizedPnL: number,
    realizedPnL: number,
    value: number
  ): void {
    const contractId = this.pnlSubscriptions.get(reqId)
    if (!contractId) return

    const key = `${contractId}`
    const position = this.positions.get(key)

    if (position) {
      position.dailyPnL = dailyPnL
      position.unrealizedPnL = unrealizedPnL
      position.realizedPnL = realizedPnL
      position.value = value

      // markの計算
      if (position.position !== 0 && value !== 0) {
        const multiplier = position.secType === 'OPT' ? 100 : 1
        position.mark = Math.abs(value) / (Math.abs(position.position) * multiplier)
      }

      this.positions.set(key, position)
      this.emit('pnlUpdated', { contractId, ...position })
    }
  }

  private onError(error: Error, code: number, reqId?: number): void {
    // PnL関連のエラー処理
    if (reqId && this.pnlSubscriptions.has(reqId)) {
      const contractId = this.pnlSubscriptions.get(reqId)

      if (code === 2150 && contractId) {
        // エラー2150は初回のみログ表示
        if (!this.pnlErrorsLogged.has(contractId)) {
          console.warn(`PnL取得エラー (Contract ${contractId}): ${error.message} - 以降のエラーは無視されます`)
          this.pnlErrorsLogged.add(contractId)
          this.emit('pnlError', { contractId, error: error.message })
        }
        return // エラーを無視して処理続行
      }
    }

    // その他のエラー
    if (code >= 500) {
      console.warn(`接続エラー (Code: ${code}):`, error.message)
      this.emit('connectionError', { error, code })
    }
  }

  /**
   * 静的データ取得（初回・更新ボタン用）
   */
  async getPositionsOnce(): Promise<PositionWithPnL[]> {
    try {
      await this.ibService.connect()
      await this.refreshPositions()

      // ポジション取得完了を待つ
      await new Promise((resolve) => setTimeout(resolve, 2000))

      return Array.from(this.positions.values())
    } catch (error) {
      console.error('Static position fetch error:', error)
      throw error
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

      // 初回ポジション取得のみ
      await this.refreshPositions()

      // 定期更新は削除 - onPnLSingleが自動でリアルタイム更新する
      // this.monitoringInterval = setInterval(...) // 削除

      this.emit('monitoringStarted')
      console.log('リアルタイム監視を開始しました（PnL自動更新モード）')
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

    this.stopAllPnLSubscriptions()
    this.emit('monitoringStopped')
    console.log('リアルタイム監視を停止しました')
  }

  private async refreshPositions(): Promise<void> {
    try {
      this.ibService.getIbApi().reqPositions()
    } catch (error) {
      this.emit('error', error)
    }
  }

  private subscribeToAllPnL(): void {
    // アカウント全体のPnL購読
    this.subscribeToAccountPnL()

    // 個別ポジションのPnL購読
    for (const position of this.positions.values()) {
      if (!position.contractId || this.activeSubscriptions.has(position.contractId)) {
        continue
      }

      const reqId = this.ibService.getNextRequestId()

      this.ibService.addPendingRequest(reqId, {
        type: 'pnlSingle',
        contractId: position.contractId,
        account: position.account,
        resolved: false,
        timestamp: Date.now(),
        reject: () => {}, // 空の関数
      })

      this.pnlSubscriptions.set(reqId, position.contractId)
      this.activeSubscriptions.add(position.contractId)

      this.ibService.getIbApi().reqPnLSingle(reqId, position.account, '', position.contractId)
    }
  }

  private subscribeToAccountPnL(): void {
    try {
      const reqId = this.ibService.getNextRequestId()
      const account = this.positions.size > 0 ? Array.from(this.positions.values())[0].account : ''

      if (!account) return

      this.ibService.addPendingRequest(reqId, {
        type: 'pnl',
        account: account,
        resolved: false,
        timestamp: Date.now(),
        reject: () => {},
      })

      this.ibService.getIbApi().reqPnL(reqId, account, '')
      console.log(`Account PnL subscription started: reqId=${reqId}, account=${account}`)
    } catch (error) {
      console.error('Error subscribing to account PnL:', error)
    }
  }

  private stopAllPnLSubscriptions(): void {
    for (const [reqId] of this.pnlSubscriptions) {
      try {
        this.ibService.getIbApi().cancelPnLSingle(reqId)
      } catch (error) {
        // エラーを無視
      }
    }

    this.pnlSubscriptions.clear()
    this.activeSubscriptions.clear()
  }

  private unsubscribeFromPnL(contractId: number): void {
    for (const [reqId, cId] of this.pnlSubscriptions) {
      if (cId === contractId) {
        try {
          this.ibService.getIbApi().cancelPnLSingle(reqId)
          this.pnlSubscriptions.delete(reqId)
          this.activeSubscriptions.delete(contractId)
        } catch (error) {
          // エラーを無視
        }
        break
      }
    }
  }

  getCurrentPositions(): PositionWithPnL[] {
    return Array.from(this.positions.values())
  }

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
}
