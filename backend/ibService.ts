// backend/ibService.ts (堅牢版)
const { IBApi, EventName, SecType, OptionType, BarSizeSetting, WhatToShow } = require('@stoqey/ib')
import { DateTime } from 'luxon'
import * as net from 'net'

export interface OptionClosePrice {
  contract: string
  strike: number
  data: { date: Date; close: number }[]
}

export interface VIXContract {
  expiry: string
  symbol: string
  strike: number
  right: 'C' | 'P'
  multiplier: number
}

interface Contract {
  symbol?: string
  secType?: string
  exchange?: string
  currency?: string
  lastTradeDateOrContractMonth?: string
  strike?: number
  right?: string
  multiplier?: number
}

interface ContractDetails {
  contract: Contract
}

export class IbService {
  private ib: any
  private connected: boolean = false
  private host: string
  private port: number
  private clientId: number

  constructor(port = 4001, host = '127.0.0.1', clientId = 100) {
    this.host = host
    this.port = port
    this.clientId = clientId

    this.ib = new IBApi({
      port: this.port,
      host: this.host,
      clientId: this.clientId,
    })

    console.log(`IBサービス初期化: ${host}:${port} (ClientID: ${clientId})`)
  }

  // ポート接続テスト
  private testPortConnection(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket()
      const timeout = setTimeout(() => {
        socket.destroy()
        resolve(false)
      }, 5000)

      socket.connect(this.port, this.host, () => {
        clearTimeout(timeout)
        socket.destroy()
        resolve(true)
      })

      socket.on('error', () => {
        clearTimeout(timeout)
        resolve(false)
      })
    })
  }

  async connect(): Promise<void> {
    if (this.connected) {
      console.log('既に接続済みです')
      return
    }

    // 事前にポート接続テスト
    console.log(`ポート接続テスト: ${this.host}:${this.port}`)
    const portOpen = await this.testPortConnection()
    if (!portOpen) {
      throw new Error(
        `ポート ${this.port} への接続に失敗しました。TWS/IB Gatewayが起動していることを確認してください。`
      )
    }
    console.log('✅ ポート接続テスト成功')

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error(`接続タイムアウト (${this.host}:${this.port})`))
      }, 15000) // 15秒でタイムアウト

      const cleanup = () => {
        if (timeout) clearTimeout(timeout)
        this.ib.off(EventName.connected, onConnected)
        this.ib.off(EventName.error, onError)
      }

      const onConnected = () => {
        cleanup()
        this.connected = true
        console.log(`✅ IBサービスに接続しました (${this.host}:${this.port})`)
        resolve()
      }

      const onError = (err: Error, code: number, reqId: number) => {
        console.log(`IB Error受信: Code=${code}, ReqId=${reqId}, Error=${err.message}`)

        // 接続関連のエラーのみキャッチ
        if (code >= 500 && code < 600) {
          cleanup()
          reject(new Error(`接続エラー (Code: ${code}): ${err.message}`))
        }
        // その他のエラーは警告として扱う
        else {
          console.warn(`IB Warning: Code=${code}, Message=${err.message}`)
        }
      }

      this.ib.on(EventName.connected, onConnected)
      this.ib.on(EventName.error, onError)

      try {
        console.log(`IBサービス接続開始: ${this.host}:${this.port}`)
        this.ib.connect()
      } catch (error) {
        cleanup()
        reject(new Error(`接続開始エラー: ${error}`))
      }
    })
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      try {
        this.ib.disconnect()
        this.connected = false
        console.log('✅ IBサービスから切断しました')
      } catch (error) {
        console.warn('切断時エラー:', error)
      }
    }
  }

  async fetchVixOptionBars(contractMonth: string, strike: number, fromDate?: Date): Promise<OptionClosePrice> {
    await this.connect()

    return new Promise((resolve, reject) => {
      const optionContract: Contract = {
        symbol: 'VIX',
        secType: SecType.OPT,
        exchange: 'SMART',
        currency: 'USD',
        lastTradeDateOrContractMonth: contractMonth,
        strike,
        right: OptionType.Put,
        multiplier: 100,
      }

      const historicalDataArray: { date: Date; close: number }[] = []
      let responded = false
      const todayStart = DateTime.now().setZone('US/Central').startOf('day').toJSDate()

      this.ib.on(EventName.historicalData, (bar: string, close: number) => {
        if (typeof bar === 'string' && bar.startsWith('finished-')) {
          if (!responded) {
            responded = true
            resolve({ contract: contractMonth, strike, data: historicalDataArray })
            // データ取得後は接続切断もOK
            this.disconnect()
          }
        } else {
          const barDate = DateTime.fromFormat(bar.split(' US/Central')[0], 'yyyyLLdd HH:mm:ss', {
            zone: 'US/Central',
          }).toJSDate()
          if ((!fromDate || barDate > fromDate) && barDate < todayStart) {
            historicalDataArray.push({ date: barDate, close })
          }
        }
      })

      this.ib.reqHistoricalData(
        5001,
        optionContract,
        '',
        '360 D',
        BarSizeSetting.HOURS_FOUR,
        WhatToShow.MIDPOINT,
        1,
        1,
        false
      )
    })
  }

  public async getAvailableExpirations(): Promise<string[]> {
    await this.connect()

    return new Promise<string[]>((resolve, reject) => {
      const reqId = Math.floor(Math.random() * 10000) + 1000
      const expirations = new Set<string>()
      let isResolved = false
      let timeoutId: NodeJS.Timeout

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId)
        this.ib.off(EventName.contractDetails, onContractDetails)
        this.ib.off(EventName.contractDetailsEnd, onContractDetailsEnd)
        this.ib.off(EventName.error, onError)
      }

      timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true
          cleanup()

          // タイムアウト時も切断
          this.disconnect()

          reject(new Error('満期日取得タイムアウト (30秒)'))
        }
      }, 30000)

      const onContractDetails = (responseReqId: number, contractDetails: ContractDetails) => {
        if (responseReqId !== reqId || isResolved) return

        const expiry = contractDetails.contract.lastTradeDateOrContractMonth
        if (expiry) {
          expirations.add(expiry)
          console.log(`満期日追加: ${expiry}`)
        }
      }

      const onContractDetailsEnd = (responseReqId: number) => {
        if (responseReqId !== reqId || isResolved) return

        isResolved = true
        cleanup()

        const uniqueExpirations = Array.from(expirations)
          .map((expiry) => expiry.split(' ')[0]) // 日付部分のみ抽出
          .sort()

        console.log(`✅ 満期日取得完了: ${uniqueExpirations.length}件`)
        resolve(uniqueExpirations)
      }

      const onError = (err: Error, code: number, responseReqId: number) => {
        if (responseReqId === reqId && !isResolved) {
          isResolved = true
          cleanup()

          // エラー時も切断
          this.disconnect()

          reject(new Error(`満期日取得エラー (Code: ${code}): ${err.message}`))
        }
      }

      this.ib.on(EventName.contractDetails, onContractDetails)
      this.ib.on(EventName.contractDetailsEnd, onContractDetailsEnd)
      this.ib.on(EventName.error, onError)

      const vixContract: Contract = {
        symbol: 'VIX',
        secType: 'OPT',
        exchange: 'CBOE',
        currency: 'USD',
      }

      console.log(`満期日取得リクエスト送信 (ReqID: ${reqId})`)
      this.ib.reqContractDetails(reqId, vixContract)
    })
  }

  // 接続状態確認
  public isConnected(): boolean {
    return this.connected
  }

  // 接続情報取得
  public getConnectionInfo() {
    return {
      host: this.host,
      port: this.port,
      clientId: this.clientId,
      connected: this.connected,
    }
  }
}
