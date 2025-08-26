// backend/ibService.ts (シンプル修正版)
import { IBApi, EventName, SecType, OptionType, BarSizeSetting, WhatToShow, Contract } from '@stoqey/ib'
import { DateTime } from 'luxon'

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

export class IbServiceManager {
  private static instance: IbService

  static getInstance(): IbService {
    if (!this.instance) {
      this.instance = new IbService(4001, '127.0.0.1', 10)
    }
    return this.instance
  }
}

export class IbService {
  private ib: IBApi
  private connected: boolean = false
  private host: string
  private port: number
  private clientId: number

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
  }

  async connect(): Promise<void> {
    if (this.connected) {
      console.log('既に接続済みです')
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

      this.ib.on(EventName.error, (err: Error, code: number) => {
        if (code >= 500 && code < 600) {
          clearTimeout(timeout)
          reject(new Error(`接続エラー (Code: ${code}): ${err.message}`))
        }
      })

      console.log(`IBサービス接続開始: ${this.host}:${this.port}`)
      this.ib.connect()
    })
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      try {
        this.ib.disconnect()
        this.connected = false
        console.log('IBサービスから切断しました')
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
      }

      const historicalDataArray: { date: Date; close: number }[] = []
      let responded = false
      const todayStart = DateTime.now().setZone('US/Central').startOf('day').toJSDate()

      this.ib.on(
        EventName.historicalData,
        (tickerId: number, bar: string, open: number, high: number, low: number, close: number) => {
          if (typeof bar === 'string' && bar.startsWith('finished-')) {
            if (!responded) {
              responded = true
              resolve({ contract: contractMonth, strike, data: historicalDataArray })
            }
          } else {
            const barDate = DateTime.fromFormat(bar.split(' US/Central')[0], 'yyyyLLdd HH:mm:ss', {
              zone: 'US/Central',
            }).toJSDate()
            if ((!fromDate || barDate > fromDate) && barDate < todayStart) {
              historicalDataArray.push({ date: barDate, close })
            }
          }
        }
      )

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
      let timeoutId: NodeJS.Timeout

      timeoutId = setTimeout(() => {
        reject(new Error('満期日取得タイムアウト (30秒)'))
      }, 30000)

      this.ib.on(EventName.contractDetails, (reqId: number, contractDetails: any) => {
        const expiry = contractDetails.contract.lastTradeDateOrContractMonth
        if (expiry) {
          expirations.add(expiry)
          console.log(`満期日追加: ${expiry}`)
        }
      })

      // contractDetailsEndがない場合の対処
      setTimeout(() => {
        clearTimeout(timeoutId)
        const uniqueExpirations = Array.from(expirations)
          .map((expiry) => expiry.split(' ')[0])
          .sort()
        console.log(`満期日取得完了: ${uniqueExpirations.length}件`)
        resolve(uniqueExpirations)
      }, 5000) // 5秒後に強制終了

      const vixContract: Contract = {
        symbol: 'VIX',
        secType: SecType.OPT,
        exchange: 'SMART',
        currency: 'USD',
      }

      console.log(`満期日取得リクエスト送信 (ReqID: ${reqId})`)
      this.ib.reqContractDetails(reqId, vixContract)
    })
  }

  public isConnected(): boolean {
    return this.connected
  }

  public getConnectionInfo() {
    return {
      host: this.host,
      port: this.port,
      clientId: this.clientId,
      connected: this.connected,
    }
  }
}
