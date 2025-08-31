// frontend/src/api/positionService.ts
const BASE_URL = 'http://macbook-pro.local:3001/api'

export interface Position {
  account: string
  symbol: string
  secType: string
  exchange: string
  currency: string
  position: number
  avgCost: number
  marketValue?: number
  contractId?: number
  localSymbol?: string
  dailyPnL?: number
  unrealizedPnL?: number
  realizedPnL?: number
  value?: number
  strike?: number
  expiry?: string
  mark?: number
  optionType?: 'PUT' | 'CALL' | null
}

export interface MarketStatus {
  isOpen: boolean
  nextOpen?: Date
  nextClose?: Date
}

export interface PositionStatus {
  isMonitoring: boolean
  positionCount: number
  pnlSubscriptions: number
  marketStatus: MarketStatus
}

export interface PositionData {
  positions: Position[]
  status: PositionStatus
  timestamp: string
}

// イベントコールバックの型定義
type EventCallback = (data: unknown) => void
type EventCallbacks = Record<string, EventCallback[]>

// 静的ポジション取得
export async function fetchCurrentPositions(): Promise<PositionData> {
  const res = await fetch(`${BASE_URL}/positions/current`)
  const data = await res.json()
  return data.data
}

// 監視制御
export async function controlMonitoring(action: 'start' | 'stop'): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${BASE_URL}/positions/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  return await res.json()
}

// 接続統計
export async function getConnectionStats(): Promise<{
  activeConnections: number
  monitoringStatus: PositionStatus
  timestamp: string
}> {
  const res = await fetch(`${BASE_URL}/positions/stats`)
  return await res.json()
}

// リアルタイムポジション監視クラス
export class PositionMonitor {
  private eventSource: EventSource | null = null
  private positions: Position[] = []
  private status: PositionStatus | null = null
  private callbacks: EventCallbacks = {}

  // イベント登録
  on(event: string, callback: EventCallback): void {
    if (!this.callbacks[event]) {
      this.callbacks[event] = []
    }
    this.callbacks[event].push(callback)
  }

  // イベント発火
  private emit(event: string, data: unknown): void {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach((callback) => callback(data))
    }
  }

  // SSE接続開始
  connect(): void {
    if (this.eventSource) {
      this.eventSource.close()
    }

    this.eventSource = new EventSource(`${BASE_URL}/positions/stream`)

    // 初期データ受信
    this.eventSource.addEventListener('initial', (event: MessageEvent) => {
      const data = JSON.parse(event.data)
      this.positions = data.data.positions
      this.status = data.data.status
      this.emit('initial', data.data)
    })

    // ポジション更新
    this.eventSource.addEventListener('positions', (event: MessageEvent) => {
      const data = JSON.parse(event.data)
      this.positions = data.data
      this.emit('positions', data.data)
    })

    // PnL更新
    this.eventSource.addEventListener('pnl', (event: MessageEvent) => {
      const data = JSON.parse(event.data)
      this.updatePositionPnL(data.data)
      this.emit('pnl', data.data)
    })

    // アカウント全体のPnL更新（新規追加）
    this.eventSource.addEventListener('accountPnl', (event: MessageEvent) => {
      const data = JSON.parse(event.data)
      console.log('Account PnL received in frontend:', data.data) // デバッグ用ログ
      this.emit('accountPnl', data.data)
    })

    // 市場状況
    this.eventSource.addEventListener('market-status', (event: MessageEvent) => {
      const data = JSON.parse(event.data)
      this.emit('marketStatus', data.data)
    })

    // ステータス更新
    this.eventSource.addEventListener('status', (event: MessageEvent) => {
      const data = JSON.parse(event.data)
      this.emit('status', data.data)
    })

    // エラー (MessageEventを使用)
    this.eventSource.addEventListener('error', (event: MessageEvent) => {
      const data = JSON.parse(event.data)
      this.emit('error', data.data)
    })

    // 接続エラー
    this.eventSource.onerror = (error: Event) => {
      console.error('SSE Connection error:', error)
      this.emit('connectionError', error)

      // 自動再接続（5秒後）
      setTimeout(() => {
        console.log('Attempting to reconnect...')
        this.connect()
      }, 5000)
    }
  }

  // 個別ポジションのPnL更新
  private updatePositionPnL(pnlData: Position): void {
    const index = this.positions.findIndex((pos) => pos.contractId === pnlData.contractId)
    if (index !== -1) {
      this.positions[index] = { ...this.positions[index], ...pnlData }
    }
  }

  // 接続終了
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
  }

  // 現在のポジション取得
  getPositions(): Position[] {
    return this.positions
  }

  // VIXポジション取得
  getVixPositions(): Position[] {
    return this.positions.filter((pos) => pos.symbol === 'VIX')
  }

  // 接続状況取得
  getStatus(): PositionStatus | null {
    return this.status
  }
}
