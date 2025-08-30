// controllers/PositionStreamController.ts
import { Request, Response } from 'express'
import { RealtimePositionService, PositionWithPnL } from '../services/ib-service/RealtimePositionService'
import { createIbServices } from '../services/ib-service'

export class PositionStreamController {
  private realtimeService: RealtimePositionService
  private activeConnections: Set<Response> = new Set()

  constructor() {
    const { ib } = createIbServices()
    this.realtimeService = new RealtimePositionService(ib)
    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    // ポジション更新時
    this.realtimeService.on('positionsUpdated', (positions: PositionWithPnL[]) => {
      this.broadcast('positions', {
        type: 'positions',
        data: positions,
        timestamp: new Date().toISOString(),
      })
    })

    // PnL更新時
    this.realtimeService.on('pnlUpdated', (pnlData: any) => {
      this.broadcast('pnl', {
        type: 'pnl',
        data: pnlData,
        timestamp: new Date().toISOString(),
      })
    })

    // 市場閉場時
    this.realtimeService.on('marketClosed', (marketStatus: any) => {
      this.broadcast('market-status', {
        type: 'market-status',
        data: {
          status: 'closed',
          message: '市場時間外です',
          ...marketStatus,
        },
        timestamp: new Date().toISOString(),
      })
    })

    // 接続エラー時
    this.realtimeService.on('connectionError', (error: any) => {
      this.broadcast('error', {
        type: 'error',
        data: {
          message: 'IB接続エラー',
          code: error.code,
          error: error.error.message,
        },
        timestamp: new Date().toISOString(),
      })
    })

    // 監視開始/停止時
    this.realtimeService.on('monitoringStarted', () => {
      this.broadcast('status', {
        type: 'status',
        data: { status: 'monitoring', message: '監視開始' },
        timestamp: new Date().toISOString(),
      })
    })

    this.realtimeService.on('monitoringStopped', () => {
      this.broadcast('status', {
        type: 'status',
        data: { status: 'stopped', message: '監視停止' },
        timestamp: new Date().toISOString(),
      })
    })
  }

  /**
   * SSEストリームエンドポイント
   */
  async streamPositions(req: Request, res: Response): Promise<void> {
    // SSE ヘッダー設定
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    })

    // 接続を管理
    this.activeConnections.add(res)
    console.log(`SSE接続追加: ${this.activeConnections.size}件`)

    // 接続時に現在の状態を送信
    const currentPositions = this.realtimeService.getCurrentPositions()
    const status = this.realtimeService.getStatus()

    this.sendToClient(res, 'initial', {
      type: 'initial',
      data: {
        positions: currentPositions,
        status: status,
      },
      timestamp: new Date().toISOString(),
    })

    // 監視開始（まだ開始していない場合）
    if (!status.isMonitoring) {
      try {
        await this.realtimeService.startMonitoring()
      } catch (error) {
        this.sendToClient(res, 'error', {
          type: 'error',
          data: { message: '監視開始に失敗しました', error: String(error) },
          timestamp: new Date().toISOString(),
        })
      }
    }

    // クライアント切断時のクリーンアップ
    req.on('close', () => {
      this.activeConnections.delete(res)
      console.log(`SSE接続削除: ${this.activeConnections.size}件`)

      // 最後の接続が切断されたら監視停止
      if (this.activeConnections.size === 0) {
        this.realtimeService.stopMonitoring()
      }
    })

    // 定期的にハートビート送信
    const heartbeat = setInterval(() => {
      if (this.activeConnections.has(res)) {
        this.sendToClient(res, 'heartbeat', {
          type: 'heartbeat',
          timestamp: new Date().toISOString(),
        })
      } else {
        clearInterval(heartbeat)
      }
    }, 30000) // 30秒間隔
  }

  /**
   * 静的ポジションデータ取得（初期表示・分析用）
   */
  async getStaticPositions(req: Request, res: Response): Promise<void> {
    try {
      const positions = this.realtimeService.getCurrentPositions()
      const status = this.realtimeService.getStatus()

      res.json({
        success: true,
        data: {
          positions,
          status,
          timestamp: new Date().toISOString(),
        },
      })
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'ポジション取得に失敗しました',
        message: String(error),
      })
    }
  }

  /**
   * 監視制御エンドポイント
   */
  async controlMonitoring(req: Request, res: Response): Promise<void> {
    const { action } = req.body

    try {
      switch (action) {
        case 'start':
          await this.realtimeService.startMonitoring()
          res.json({ success: true, message: '監視を開始しました' })
          break

        case 'stop':
          this.realtimeService.stopMonitoring()
          res.json({ success: true, message: '監視を停止しました' })
          break

        default:
          res.status(400).json({ success: false, message: '無効なアクション' })
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: '操作に失敗しました',
        message: String(error),
      })
    }
  }

  /**
   * 全クライアントにブロードキャスト
   */
  private broadcast(event: string, data: any): void {
    for (const connection of this.activeConnections) {
      this.sendToClient(connection, event, data)
    }
  }

  /**
   * 個別クライアントにデータ送信
   */
  private sendToClient(res: Response, event: string, data: any): void {
    try {
      res.write(`event: ${event}\n`)
      res.write(`data: ${JSON.stringify(data)}\n\n`)
    } catch (error) {
      console.warn('SSE送信エラー:', error)
      this.activeConnections.delete(res)
    }
  }

  /**
   * 接続統計取得
   */
  getConnectionStats(req: Request, res: Response): void {
    const status = this.realtimeService.getStatus()

    res.json({
      activeConnections: this.activeConnections.size,
      monitoringStatus: status,
      timestamp: new Date().toISOString(),
    })
  }
}
