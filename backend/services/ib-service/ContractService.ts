// services/ib-service/ContractService.ts
import { EventName, SecType, Contract } from '@stoqey/ib'
import { IbService } from './IbService'

export class ContractService {
  constructor(private ibService: IbService) {
    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    this.ibService.getIbApi().on(EventName.contractDetails, this.onContractDetails.bind(this))
  }

  private onContractDetails(reqId: number, contractDetails: any): void {
    const request = this.ibService.getPendingRequest(reqId)
    if (!request) return

    const expiry = contractDetails.contract.lastTradeDateOrContractMonth
    if (expiry) {
      request.expirations.add(expiry)
    }
  }

  public async getAvailableExpirations(): Promise<string[]> {
    await this.ibService.connect()

    return new Promise<string[]>((resolve, reject) => {
      const reqId = this.ibService.getNextRequestId()
      const expirations = new Set<string>()

      this.ibService.addPendingRequest(reqId, {
        expirations,
        resolve: (result: string[]) => resolve(result),
        reject,
        resolved: false,
        timestamp: Date.now(),
      })

      const timeoutId = setTimeout(() => {
        const request = this.ibService.getPendingRequest(reqId)
        if (request && !request.resolved) {
          request.resolved = true
          let uniqueExpirations = Array.from(expirations)
            .map((expiry) => expiry.split(' ')[0])
            .sort()
          uniqueExpirations = this.filterSecondTuesday(uniqueExpirations)
          console.log(`満期日取得完了 (タイムアウト): ${uniqueExpirations.length}件`)
          resolve(uniqueExpirations)
          this.ibService.removePendingRequest(reqId)
        }
      }, 10000)

      const vixContract: Contract = {
        symbol: 'VIX',
        secType: SecType.OPT,
        exchange: 'SMART',
        currency: 'USD',
      }

      console.log(`満期日取得リクエスト送信 (ReqID: ${reqId})`)
      this.ibService.getIbApi().reqContractDetails(reqId, vixContract)
    })
  }

  // 先物用（新規）
  async getAvailableFutureExpirations(): Promise<string[]> {
    await this.ibService.connect()

    return new Promise<string[]>((resolve, reject) => {
      const reqId = this.ibService.getNextRequestId()
      const expirations = new Set<string>()

      this.ibService.addPendingRequest(reqId, {
        expirations,
        resolve: (result: string[]) => resolve(result),
        reject,
        resolved: false,
        timestamp: Date.now(),
      })

      const timeoutId = setTimeout(() => {
        const request = this.ibService.getPendingRequest(reqId)
        if (request && !request.resolved) {
          request.resolved = true
          let uniqueExpirations = Array.from(expirations)
            .map((expiry) => expiry.split(' ')[0])
            .sort()
          console.log(`先物満期日取得完了 (タイムアウト): ${uniqueExpirations.length}件`)
          resolve(uniqueExpirations)
          this.ibService.removePendingRequest(reqId)
        }
      }, 10000)

      const vixFutureContract: Contract = {
        symbol: 'VIX',
        secType: SecType.FUT,
        exchange: 'CFE',
        currency: 'USD',
        tradingClass: 'VX',
      }

      console.log(`先物満期日取得リクエスト送信 (ReqID: ${reqId})`)
      this.ibService.getIbApi().reqContractDetails(reqId, vixFutureContract)
    })
  }

  filterSecondTuesday(expirations: string[]): string[] {
    return expirations.filter((expiry) => {
      const year = parseInt(expiry.slice(0, 4), 10)
      const month = parseInt(expiry.slice(4, 6), 10) - 1
      const day = parseInt(expiry.slice(6, 8), 10)

      const date = new Date(year, month, day)

      if (date.getDay() !== 2) return false

      const firstDayOfMonth = new Date(year, month, 1).getDay()
      const firstTuesday = 1 + ((2 - firstDayOfMonth + 7) % 7)
      const secondTuesday = firstTuesday + 7
      const thirdTuesday = secondTuesday + 7

      return day === thirdTuesday
    })
  }
}
