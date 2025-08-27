import { IbService } from '../services/IbService'
import mongoose from 'mongoose'
import { ExpirationService } from '../services/ExpirationService'
import { BarSizeSetting } from '@stoqey/ib'

async function connectDB() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect('mongodb://127.0.0.1:27017/vixdb', {})
    console.log('MongoDB接続完了')
  }
}

async function testVixFutures() {
  console.log('=== VIX先物データ取得テスト開始 ===')

  const ibService = IbService.getInstance()
  const expirationService = ExpirationService.getInstance()

  try {
    // テスト1: 単一契約のデータ取得
    console.log('\n--- テスト1: 単一VIX先物データ取得 ---')
    const singleResult = await ibService.fetchVixFutureBars('20250917', 90, undefined) // 3ヶ月分

    console.log('取得結果:')
    console.log(`- 契約月: ${singleResult.contract}`)
    console.log(`- データ件数: ${singleResult.actualDataPoints}`)
    console.log(`- 期間: ${singleResult.requestedDuration}`)

    if (singleResult.data.length > 0) {
      const latest = singleResult.data[singleResult.data.length - 1]
      const oldest = singleResult.data[0]
      console.log(`- 最新データ: ${latest.date.toISOString().split('T')[0]} - 終値: ${latest.close}`)
      console.log(`- 最古データ: ${oldest.date.toISOString().split('T')[0]} - 終値: ${oldest.close}`)
    }

    // テスト2: 複数契約のデータ取得
    console.log('\n--- テスト2: 複数VIX先物データ取得 ---')
    await connectDB()
    const contractMonths = await expirationService.getFutureExpirations()
    const multipleResults = await ibService.fetchMultipleVixFutureBars(contractMonths, 60) // 2ヶ月分

    console.log('複数取得結果:')
    multipleResults.forEach((result) => {
      console.log(`- ${result.contract}: ${result.actualDataPoints}件`)
      if (result.data.length > 0) {
        const latest = result.data[result.data.length - 1]
        console.log(`  最新: ${latest.date.toISOString().split('T')[0]} - ${latest.close}`)
      }
    })

    // テスト3: 接続状態確認
    console.log('\n--- 接続状態確認 ---')
    const connectionInfo = ibService.getConnectionInfo()
    console.log('接続情報:', connectionInfo)

    const pendingStatus = ibService.getPendingRequestsStatus()
    console.log('保留中リクエスト:', pendingStatus)
  } catch (error) {
    console.error('テストエラー:', error)
  } finally {
    await mongoose.disconnect()
    // クリーンアップ
    console.log('\n--- クリーンアップ ---')
    await ibService.cleanup()
    console.log('=== VIX先物データ取得テスト完了 ===')
  }
}

// テスト実行
if (require.main === module) {
  testVixFutures()
    .then(() => {
      console.log('\n基本テスト完了。')
      process.exit(0)
    })
    .catch(console.error)
}

export { testVixFutures }
