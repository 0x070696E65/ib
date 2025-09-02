// services/ib-service/index.ts
import { IbService } from './IbService'
import { HistoricalDataService } from './HistoricalDataService'
import { ContractService } from './ContractService'
import { PositionService } from './PositionService'
import { OptionPriceService } from './OptionPriceService'
import { FuturePriceService } from './FuturePriceService'

export { IbService } from './IbService'
export { HistoricalDataService } from './HistoricalDataService'
export { PositionService } from './PositionService'
export { ContractService } from './ContractService'
export { OptionPriceService } from './OptionPriceService'
export { FuturePriceService } from './FuturePriceService'

export * from './types'

// 便利なファクトリー関数
export function createIbServices() {
  const ibService = IbService.getInstance()
  return {
    ib: ibService,
    historical: new HistoricalDataService(ibService),
    positions: new PositionService(ibService),
    contracts: new ContractService(ibService),
    optionPrice: new OptionPriceService(ibService),
    futurePrice: new FuturePriceService(ibService),
  }
}

// 個別インスタンス作成用のファクトリー関数
export function createIbServiceWithConfig(port = 4001, host = '127.0.0.1', clientId = 10) {
  const ibService = new IbService(port, host, clientId)
  return {
    ib: ibService,
    historical: new HistoricalDataService(ibService),
    positions: new PositionService(ibService),
    contracts: new ContractService(ibService),
  }
}
