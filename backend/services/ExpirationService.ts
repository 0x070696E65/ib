// services/ExpirationService.ts
import { createIbServices } from '.'
import { VixExpirationModel, VixFutureExpirationModel } from '../models/VixExpiration'

export class ExpirationService {
  private static instance: ExpirationService
  private ibServices = createIbServices()

  static getInstance(): ExpirationService {
    if (!this.instance) {
      this.instance = new ExpirationService()
    }
    return this.instance
  }

  async getOptionExpirations(): Promise<string[]> {
    try {
      const expirations = await VixExpirationModel.find({ isEnded: false }).sort({ expiration: 1 })
      return expirations.map((e) => e.expiration)
    } catch (error) {
      console.error('満期日取得エラー:', error)
      throw error
    }
  }

  async getFutureExpirations(): Promise<string[]> {
    try {
      const expirations = await VixFutureExpirationModel.find({ isEnded: false })
      return expirations.map((e) => e.expiration)
    } catch (error) {
      console.error('満期日取得エラー:', error)
      throw error
    }
  }

  async updateExpirations() {
    try {
      const futureExpirations = await this.ibServices.contracts.getAvailableFutureExpirations()
      const optionExpirations = this.minusOneDayVixExpirations(futureExpirations)
      console.log(`満期日取得完了: ${optionExpirations.length}件, 先物: ${futureExpirations.length}件`)
      await this.updateOptionExpirationsInDB(optionExpirations)
      await this.updateFutureExpirationsInDB(futureExpirations)
    } catch (error) {
      console.error('満期日更新エラー:', error)
      throw error
    }
  }

  minusOneDayVixExpirations(expirations: string[]): string[] {
    return expirations.map((expiry) => {
      const year = parseInt(expiry.slice(0, 4), 10)
      const month = parseInt(expiry.slice(4, 6), 10) - 1
      const day = parseInt(expiry.slice(6, 8), 10)

      const date = new Date(year, month, day)
      // 先物の満期日の翌日にする
      date.setDate(date.getDate() - 1)

      const yyyy = date.getFullYear()
      const mm = String(date.getMonth() + 1).padStart(2, '0')
      const dd = String(date.getDate()).padStart(2, '0')

      return `${yyyy}${mm}${dd}`
    })
  }

  private async updateOptionExpirationsInDB(expirations: string[]): Promise<void> {
    console.log(`満期日をDBに保存: ${expirations.length}件`)

    // DBに既存の満期日を取得
    const existingDocs = await VixExpirationModel.find({}, { expiration: 1 })
    const existingExpirations = new Set(existingDocs.map((d) => d.expiration))

    // 今回IBから取得した満期日
    const currentExpirations = new Set(expirations)
    const operations: any[] = []

    // 取得できたものは isEnded = false で upsert
    for (const exp of expirations) {
      operations.push({
        updateOne: {
          filter: { expiration: exp },
          update: { $set: { expiration: exp, isEnded: false } },
          upsert: true,
        },
      })
    }

    // DBにはあるが今回返ってこなかったもの → isEnded = true
    for (const exp of existingExpirations) {
      if (!currentExpirations.has(exp)) {
        operations.push({
          updateOne: {
            filter: { expiration: exp },
            update: { $set: { isEnded: true } },
            upsert: false,
          },
        })
      }
    }

    if (operations.length > 0) {
      await VixExpirationModel.collection.bulkWrite(operations, { ordered: false })
    }
  }

  private async updateFutureExpirationsInDB(expirations: string[]): Promise<void> {
    console.log(`先物満期日をDBに保存: ${expirations.length}件`)

    // DBに既存の満期日を取得
    const existingDocs = await VixFutureExpirationModel.find({}, { expiration: 1 })
    const existingExpirations = new Set(existingDocs.map((d) => d.expiration))

    // 今回IBから取得した満期日
    const currentExpirations = new Set(expirations)
    const operations: any[] = []

    // 取得できたものは isEnded = false で upsert
    for (const exp of expirations) {
      operations.push({
        updateOne: {
          filter: { expiration: exp },
          update: { $set: { expiration: exp, isEnded: false } },
          upsert: true,
        },
      })
    }

    // DBにはあるが今回返ってこなかったもの → isEnded = true
    for (const exp of existingExpirations) {
      if (!currentExpirations.has(exp)) {
        operations.push({
          updateOne: {
            filter: { expiration: exp },
            update: { $set: { isEnded: true } },
            upsert: false,
          },
        })
      }
    }

    if (operations.length > 0) {
      await VixFutureExpirationModel.collection.bulkWrite(operations, { ordered: false })
    }
  }
}
