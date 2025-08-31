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
  private activeSubscriptions: Set<number> = new Set() // contractIds that are actively subscribed
  private monitoringInterval?: NodeJS.Timeout
  private isMonitoring: boolean = false
  private marketStatus: MarketStatus = { isOpen: false }
  private isSubscribingPnL: boolean = false

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
    this.ibService.getIbApi().on(EventName.pnl as any, this.onPnL.bind(this) as any)

    // エラーハンドリング
    this.ibService.getIbApi().on(EventName.error, this.onError.bind(this))
  }

  private onPosition(accountName: string, contract: any, position: number, avgCost: number): void {
    if (position === 0) {
      // ポジションが0の場合、既存のポジションを削除
      const key = `${contract.conId}`
      if (this.positions.has(key)) {
        this.positions.delete(key)
        // 対応するPnL購読も停止
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
      positionData.strike = this.extractStrikeFromLocalSymbol(contract.localSymbol)
      positionData.expiry = this.extractExpiryFromLocalSymbol(contract.localSymbol)
      positionData.optionType = this.extractOptionType(contract.localSymbol)
    }

    this.positions.set(key, positionData)
  }

  private onPositionEnd(): void {
    this.emit('positionsUpdated', Array.from(this.positions.values()))

    // PnL購読を遅延実行（重複を避けるため）
    if (!this.isSubscribingPnL) {
      setTimeout(() => {
        this.subscribeToAllPnL()
      }, 1000)
    }
  }

  private onPnL(reqId: number, dailyPnL: number, unrealizedPnL: number, realizedPnL: number): void {
    console.log(`Account PnL Update: dailyPnL=${dailyPnL}, unrealizedPnL=${unrealizedPnL}, realizedPnL=${realizedPnL}`)

    // アカウント全体のPnL情報をemit
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

      // markの計算を修正
      if (position.position !== 0 && value !== 0) {
        const multiplier = position.secType === 'OPT' ? 100 : 1
        position.mark = value / (Math.abs(position.position) * multiplier)
      }

      this.positions.set(key, position)

      // 個別ポジションPnL更新イベント
      this.emit('pnlUpdated', {
        contractId: contractId,
        ...position,
      })
    }
  }

  private onError(error: Error, code: number, reqId?: number): void {
    console.warn(`リアルタイム監視エラー (Code: ${code}):`, error.message)

    // PnL関連のエラーハンドリング
    if (reqId && this.pnlSubscriptions.has(reqId)) {
      const contractId = this.pnlSubscriptions.get(reqId)
      console.warn(`PnL Request ${reqId} failed for contract ${contractId}:`, error.message)

      // 失敗した購読を削除
      this.pnlSubscriptions.delete(reqId)
      if (contractId) {
        this.activeSubscriptions.delete(contractId)
      }

      // pending requestも削除
      this.ibService.removePendingRequest(reqId)
    }

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

      // 定期更新開始（5秒間隔に変更）
      this.monitoringInterval = setInterval(async () => {
        this.updateMarketStatus()
        if (this.marketStatus.isOpen) {
          await this.refreshPositions()
        }
      }, 5000)

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

    // PnL購読を安全に停止
    this.stopAllPnLSubscriptions()

    this.emit('monitoringStopped')
    console.log('リアルタイム監視を停止しました')
  }

  /**
   * すべてのPnL購読を停止
   */
  private stopAllPnLSubscriptions(): void {
    for (const [reqId, contractId] of this.pnlSubscriptions) {
      try {
        this.ibService.getIbApi().cancelPnLSingle(reqId)
        console.log(`PnL subscription cancelled: reqId=${reqId}, contractId=${contractId}`)
      } catch (error) {
        console.warn(`Failed to cancel PnL subscription ${reqId}:`, error)
      }
    }

    this.pnlSubscriptions.clear()
    this.activeSubscriptions.clear()
  }

  /**
   * 特定のcontractIdのPnL購読を停止
   */
  private unsubscribeFromPnL(contractId: number): void {
    for (const [reqId, cId] of this.pnlSubscriptions) {
      if (cId === contractId) {
        try {
          this.ibService.getIbApi().cancelPnLSingle(reqId)
          this.pnlSubscriptions.delete(reqId)
          this.activeSubscriptions.delete(contractId)
          console.log(`PnL subscription cancelled for contract ${contractId}`)
        } catch (error) {
          console.warn(`Failed to cancel PnL subscription for contract ${contractId}:`, error)
        }
        break
      }
    }
  }

  /**
   * ポジション情報を更新
   */
  private async refreshPositions(): Promise<void> {
    try {
      // ポジション一覧をリクエスト
      this.ibService.getIbApi().reqPositions()
      // → onPosition / onPositionEnd で positions が更新される
    } catch (error) {
      this.emit('error', error)
    }
  }

  /**
   * すべてのポジションのPnLを購読
   */
  private subscribeToAllPnL(): void {
    if (this.isSubscribingPnL) return

    this.isSubscribingPnL = true

    try {
      // まず全体のPnLを購読してみる
      this.subscribeToAccountPnL()

      // 個別ポジションのPnL購読は一時的に無効化
      console.log('Individual PnL subscription temporarily disabled due to API issues')

      /*
      for (const position of this.positions.values()) {
        if (!position.contractId || !position.account) {
          console.warn(`Invalid position data for PnL subscription:`, position)
          continue
        }

        // すでに購読中の場合はスキップ
        if (this.activeSubscriptions.has(position.contractId)) {
          continue
        }

        // バリデーション
        if (!this.isValidForPnLSubscription(position)) {
          console.warn(`Position validation failed for contract ${position.contractId}:`, position)
          continue
        }

        const reqId = this.ibService.getNextRequestId()
        
        // pending requestに追加
        this.ibService.addPendingRequest(reqId, {
          type: 'pnlSingle',
          contractId: position.contractId,
          account: position.account,
          resolved: false,
          timestamp: Date.now(),
          reject: (err: Error) => {
            console.error(`PnL Request ${reqId} failed:`, err.message)
          },
        })

        // 購読マップに追加
        this.pnlSubscriptions.set(reqId, position.contractId)
        this.activeSubscriptions.add(position.contractId)

        // PnL購読開始 - modelCodeを明示的に指定
        this.ibService.getIbApi().reqPnLSingle(reqId, position.account, position.account, position.contractId)
        
        console.log(`PnL subscription started: reqId=${reqId}, contractId=${position.contractId}, account=${position.account}`)
      }
      */
    } catch (error) {
      console.error('Error in subscribeToAllPnL:', error)
    } finally {
      this.isSubscribingPnL = false
    }
  }

  /**
   * アカウント全体のPnLを購読
   */
  private subscribeToAccountPnL(): void {
    try {
      const reqId = this.ibService.getNextRequestId()
      const account = this.positions.size > 0 ? Array.from(this.positions.values())[0].account : ''

      if (!account) {
        console.warn('No account found for PnL subscription')
        return
      }

      this.ibService.addPendingRequest(reqId, {
        type: 'pnl',
        account: account,
        resolved: false,
        timestamp: Date.now(),
      })

      // アカウント全体のPnLを購読
      this.ibService.getIbApi().reqPnL(reqId, account, '')
      console.log(`Account PnL subscription started: reqId=${reqId}, account=${account}`)
    } catch (error) {
      console.error('Error subscribing to account PnL:', error)
    }
  }

  /**
   * PnL購読のバリデーション
   */
  private isValidForPnLSubscription(position: PositionWithPnL): boolean {
    return !!(
      position.contractId &&
      position.account &&
      position.contractId > 0 &&
      position.account.trim().length > 0 &&
      position.position !== 0
    )
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
    activeSubscriptions: number
    marketStatus: MarketStatus
  } {
    return {
      isMonitoring: this.isMonitoring,
      positionCount: this.positions.size,
      pnlSubscriptions: this.pnlSubscriptions.size,
      activeSubscriptions: this.activeSubscriptions.size,
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
