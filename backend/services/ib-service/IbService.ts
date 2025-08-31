// services/ib-service/IbService.ts
import { IBApi, EventName } from '@stoqey/ib'
import { ConnectionInfo, PendingRequestsStatus } from './types'

export class IbService {
  private static instance: IbService
  private ib: IBApi
  private connected: boolean = false
  private host: string
  private port: number
  private clientId: number
  private requestIdCounter: number = 5000
  private pendingRequests: Map<number, any> = new Map()

  constructor(port = 4001, host = '127.0.0.1', clientId = 10) {
    this.host = host
    this.port = port
    this.clientId = clientId

    this.ib = new IBApi({
      port: this.port,
      host: this.host,
      clientId: this.clientId,
    })

    console.log(`IBサービス初期化: ${host}:${port} (ClientID: ${clientId})`)
    this.setupEventListeners()
  }

  static getInstance(port = 4001, host = '127.0.0.1', clientId = 10): IbService {
    if (!this.instance) {
      this.instance = new IbService(port, host, clientId)
    }
    return this.instance
  }

  private setupEventListeners(): void {
    this.ib.on(EventName.error, this.onError.bind(this))
  }

  private onError(err: Error, code: number, reqId?: number): void {
    console.warn(`IBエラー (Code: ${code}):`, err.message)

    if (reqId && this.pendingRequests.has(reqId)) {
      const request = this.pendingRequests.get(reqId)
      if (!request.resolved) {
        request.resolved = true
        request.reject(new Error(`IBエラー (Code: ${code}): ${err.message}`))
        this.pendingRequests.delete(reqId)
      }
    }

    if (code >= 500 && code < 600) {
      this.connected = false
    }
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`接続タイムアウト (${this.host}:${this.port})`))
      }, 15000)

      this.ib.on(EventName.connected, () => {
        clearTimeout(timeout)
        this.connected = true
        console.log(`IBサービスに接続しました (ClientID: ${this.clientId})`)
        resolve()
      })

      console.log(`IBサービス接続開始: ${this.host}:${this.port}`)
      this.ib.connect()
    })
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      try {
        for (const [reqId, request] of this.pendingRequests) {
          if (!request.resolved) {
            request.resolved = true
            request.reject(new Error('接続が切断されました'))
          }
        }
        this.pendingRequests.clear()

        this.ib.disconnect()
        this.connected = false
        console.log('IBサービスから切断しました')
      } catch (error) {
        console.warn('切断時エラー:', error)
      }
    }
  }

  // 他のサービスから使用するためのパブリックメソッド
  public getIbApi(): IBApi {
    return this.ib
  }

  public getNextRequestId(): number {
    return ++this.requestIdCounter
  }

  public addPendingRequest(id: number, request: any): void {
    this.pendingRequests.set(id, request)
  }

  public removePendingRequest(id: number): void {
    this.pendingRequests.delete(id)
  }

  public getPendingRequest(id: number): any {
    return this.pendingRequests.get(id)
  }

  public isConnected(): boolean {
    return this.connected
  }

  public getConnectionInfo(): ConnectionInfo {
    return {
      host: this.host,
      port: this.port,
      clientId: this.clientId,
      connected: this.connected,
      pendingRequests: this.pendingRequests.size,
    }
  }

  public getPendingRequestsStatus(): PendingRequestsStatus {
    const requests = Array.from(this.pendingRequests.entries()).map(([id, req]) => ({
      requestId: id,
      type: req.contractMonth ? 'historicalData' : 'contractDetails',
      contract: req.contractMonth || 'N/A',
      strike: req.strike || 'N/A',
      duration: req.duration || 'N/A',
      elapsed: Date.now() - req.timestamp,
    }))

    return {
      count: requests.length,
      requests,
    }
  }

  public async cleanup(): Promise<void> {
    console.log('IBサービスをクリーンアップ中...')
    await this.disconnect()
  }
}
