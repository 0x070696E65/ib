// test/vix-data-service-test.ts (修正版)
import mongoose from 'mongoose'
import { VixDataService } from '../services/VixDataService'
import { ExpirationService } from '../services/ExpirationService'
import { IbServiceManager } from '../services/IbService'

// MongoDB接続セットアップ
async function setupDatabase() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect('mongodb://127.0.0.1:27017/vixdb', {})
    console.log('MongoDB接続完了')
  }
}

async function teardownDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
    console.log('MongoDB切断完了')
  }
}

// 利用可能な契約情報を取得する関数
async function getValidContracts(): Promise<{ expirations: string[]; validStrikes: number[] }> {
  console.log('有効な契約情報を取得中...')

  try {
    // 接続をリセットして新しいインスタンスを使用
    const ibService = IbServiceManager.getInstance()
    await ibService.cleanup()

    // 少し待機
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const expirationService = ExpirationService.getInstance()
    const expirations = await expirationService.getExpirations()

    if (expirations.length === 0) {
      throw new Error('有効な満期日が見つかりませんでした')
    }

    // テスト用に安全なストライク範囲を使用
    const validStrikes = [12, 15, 18, 20, 25, 30]

    console.log(`取得した満期日: ${expirations.length}件`)
    console.log(`最新: ${expirations[0]}`)
    console.log(`使用ストライク: ${validStrikes.join(', ')}`)

    return { expirations, validStrikes }
  } catch (error) {
    console.error('契約情報取得エラー:', error)
    throw error
  }
}

async function testExpirations() {
  console.log('満期日取得テスト開始')
  console.log('='.repeat(40))

  try {
    const startTime = Date.now()
    const expirationService = ExpirationService.getInstance()
    const expirations = await expirationService.getExpirations()
    const duration = Date.now() - startTime

    console.log('満期日取得成功:')
    expirations.forEach((exp, index) => {
      console.log(`  ${index + 1}. ${exp}`)
    })
    console.log(`合計: ${expirations.length}件`)
    console.log(`処理時間: ${(duration / 1000).toFixed(2)}秒`)

    if (expirations.length === 0) {
      throw new Error('満期日が取得できませんでした。IBが起動しているか確認してください。')
    }

    return expirations
  } catch (error) {
    console.error('満期日取得エラー:', error)
    throw error
  }
}

async function testSmallBatch() {
  console.log('小規模バッチテスト開始')
  console.log('='.repeat(40))

  try {
    // 簡単な設定でテスト
    const testStrikes = [15, 20, 25] // 3つのストライクでテスト
    console.log(`テスト対象ストライク: ${testStrikes.join(', ')}`)

    const service = new VixDataService()
    const summary = await service.fetchAllVixData(testStrikes)

    console.log('小規模バッチテスト結果:')
    console.log(`  処理時間: ${summary.duration}`)
    console.log(`  満期日数: ${summary.expirations}件`)
    console.log(`  総リクエスト: ${summary.totalRequests}件`)
    console.log(`  成功: ${summary.successCount}件`)
    console.log(`  失敗: ${summary.errorCount}件`)

    if (summary.optimizationStats) {
      console.log('最適化統計:')
      console.log(`  30日: ${summary.optimizationStats.duration30D}件`)
      console.log(`  90日: ${summary.optimizationStats.duration90D}件`)
      console.log(`  360日: ${summary.optimizationStats.duration360D}件`)
    }

    console.log('詳細 (最初の10件):')
    summary.details.slice(0, 10).forEach((detail, index) => {
      const status = detail.status === 'success' ? '✅' : '❌'
      const info = detail.status === 'success' ? `${detail.dataCount}件` : detail.error?.substring(0, 50)
      const optimization = detail.optimizationReason ? ` (${detail.optimizationReason})` : ''
      console.log(`  ${index + 1}. ${status} ${detail.expiration} Strike${detail.strike}: ${info}${optimization}`)
    })

    if (summary.details.length > 10) {
      console.log(`  ... (残り${summary.details.length - 10}件)`)
    }

    return summary
  } catch (error) {
    console.error('小規模バッチテストエラー:', error)
    throw error
  }
}

// IBサービスの直接テスト
async function testIbServiceBatch() {
  console.log('IBサービス直接バッチテスト開始')
  console.log('='.repeat(40))

  try {
    // 実際に存在する契約を取得
    const { expirations, validStrikes } = await getValidContracts()

    // テスト用のリクエスト（実在する契約のみ）
    const requests = [
      { contractMonth: expirations[0], strike: validStrikes[0], durationDays: 30 },
      { contractMonth: expirations[0], strike: validStrikes[1], durationDays: 90 },
    ]

    // 複数の満期日がある場合は追加
    if (expirations.length > 1) {
      requests.push({ contractMonth: expirations[1], strike: validStrikes[0], durationDays: 360 })
    }

    console.log(`テストリクエスト: ${requests.length}件`)
    requests.forEach((req, index) => {
      console.log(`  ${index + 1}. ${req.contractMonth} Strike${req.strike} (${req.durationDays}日)`)
    })

    const ibService = IbServiceManager.getInstance()
    const startTime = Date.now()
    const results = await ibService.fetchMultipleVixOptionBars(requests)
    const duration = Date.now() - startTime

    console.log('IBサービス直接テスト結果:')
    console.log(`  処理時間: ${(duration / 1000).toFixed(2)}秒`)
    console.log(`  成功件数: ${results.length}件`)

    results.forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.contract} Strike${result.strike}: ${result.data.length}データポイント`)
    })

    return results
  } catch (error) {
    console.error('IBサービス直接テストエラー:', error)
    throw error
  }
}

// 接続状況テスト
async function testConnectionStatus() {
  console.log('接続状況テスト開始')
  console.log('='.repeat(40))

  const service = new VixDataService()

  try {
    console.log('接続前の状況:')
    const beforeStatus = service.getConnectionStatus()
    console.log(`  接続状態: ${beforeStatus.connected}`)
    console.log(`  保留リクエスト: ${beforeStatus.pendingRequests || 0}件`)

    // 接続テスト
    const ibService = IbServiceManager.getInstance()
    await ibService.connect()

    console.log('接続後の状況:')
    const afterStatus = service.getConnectionStatus()
    console.log(`  接続状態: ${afterStatus.connected}`)
    console.log(`  ホスト: ${afterStatus.host}:${afterStatus.port}`)
    console.log(`  クライアントID: ${afterStatus.clientId}`)

    await ibService.cleanup()

    console.log('切断後の状況:')
    const cleanupStatus = service.getConnectionStatus()
    console.log(`  接続状態: ${cleanupStatus.connected}`)

    return { beforeStatus, afterStatus, cleanupStatus }
  } catch (error) {
    console.error('接続状況テストエラー:', error)
    throw error
  }
}

// エラー耐性テスト
async function testErrorHandling() {
  console.log('エラー耐性テスト開始')
  console.log('='.repeat(40))

  const ibService = IbServiceManager.getInstance()

  try {
    await ibService.connect()

    // 無効な契約でテスト
    const invalidRequests = [
      { contractMonth: '20200101', strike: 999, durationDays: 30 }, // 過去の日付
      { contractMonth: '20990101', strike: -10, durationDays: 90 }, // 未来過ぎる日付、負のストライク
    ]

    console.log('無効な契約でのテスト開始...')

    try {
      const results = await ibService.fetchMultipleVixOptionBars(invalidRequests)
      console.log('エラーが期待されましたが成功しました:', results.length)
    } catch (error) {
      console.log('期待通りエラーが発生:', (error as Error).message.substring(0, 100))
    }

    return true
  } catch (error) {
    console.error('エラー耐性テストでエラー:', error)
    return false
  } finally {
    await ibService.cleanup()
  }
}

// 全テスト実行
async function runAllTests() {
  await setupDatabase()

  try {
    console.log('VIXデータサービス全テスト開始')
    console.log('='.repeat(50))

    await testExpirations()
    await testSmallBatch()
    await testIbServiceBatch()
    await testConnectionStatus()
    await testErrorHandling()

    console.log('='.repeat(50))
    console.log('全テスト完了')
  } finally {
    await teardownDatabase()
  }
}

// 個別テスト実行用
async function runIndividualTest(testName: string) {
  await setupDatabase()

  try {
    switch (testName) {
      case 'contracts':
        return await getValidContracts()
      case 'expirations':
        return await testExpirations()
      case 'batch':
        return await testSmallBatch()
      case 'ib-batch':
        return await testIbServiceBatch()
      case 'connection':
        return await testConnectionStatus()
      case 'error':
        return await testErrorHandling()
      default:
        throw new Error(`未知のテスト: ${testName}`)
    }
  } finally {
    await teardownDatabase()
  }
}

if (require.main === module) {
  const testArg = process.argv[2]

  if (testArg) {
    // 個別テスト実行
    console.log(`${testArg}テスト開始`)
    runIndividualTest(testArg)
      .then((result) => {
        console.log(`${testArg}テスト成功`)
        process.exit(0)
      })
      .catch((error) => {
        console.log(`${testArg}テスト失敗:`, error.message)
        process.exit(1)
      })
  } else {
    // 全テスト実行
    runAllTests()
      .then(() => {
        console.log('全テスト成功')
        process.exit(0)
      })
      .catch((error) => {
        console.log('全テスト失敗:', error.message)
        process.exit(1)
      })
  }
}

export {
  getValidContracts,
  testExpirations,
  testSmallBatch,
  testIbServiceBatch,
  testConnectionStatus,
  testErrorHandling,
}
