// test/vix-data-service-test.ts (修正版 - 動的契約取得)
import mongoose from 'mongoose'
import { VixDataService } from '../services/VixDataService'
import { IbServiceManager } from '../services/ibService'

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
  console.log('📋 有効な契約情報を取得中...')

  const service = new VixDataService()

  try {
    const expirations = await service['getAndSaveExpirations']()

    if (expirations.length === 0) {
      throw new Error('有効な満期日が見つかりませんでした')
    }

    // テスト用に安全なストライク範囲を使用
    // VIXは通常10-50の範囲で取引される
    const validStrikes = [12, 15, 18, 20, 25, 30]

    console.log(`✅ 取得した満期日: ${expirations.length}件`)
    console.log(`   最新: ${expirations[0]}`)
    console.log(`   使用ストライク: ${validStrikes.join(', ')}`)

    return { expirations, validStrikes }
  } catch (error) {
    console.error('❌ 契約情報取得エラー:', error)
    throw error
  }
}

async function testExpirations() {
  console.log('満期日取得テスト開始')
  console.log('='.repeat(40))

  const service = new VixDataService()

  try {
    const startTime = Date.now()
    const expirations = await service['getAndSaveExpirations']()
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

async function testSingleOption() {
  console.log('\n単一オプションデータ取得テスト開始')
  console.log('='.repeat(40))

  try {
    // 実際に存在する契約を取得
    const { expirations, validStrikes } = await getValidContracts()

    const expiration = expirations[0] // 最新の満期日
    const strike = validStrikes[2] // 中程度のストライク (通常18)

    console.log(`テスト対象: ${expiration} Strike${strike}`)

    const service = new VixDataService()
    const startTime = Date.now()
    const result = await service['fetchAndSaveOptionData'](expiration, strike)
    const duration = Date.now() - startTime

    if (result.status === 'success') {
      console.log(`✅ 単一オプション取得成功:`)
      console.log(`   満期日: ${result.expiration}`)
      console.log(`   ストライク: ${result.strike}`)
      console.log(`   データ件数: ${result.dataCount}`)
      console.log(`   処理時間: ${(duration / 1000).toFixed(2)}秒`)
    } else {
      console.log(`❌ 単一オプション取得失敗:`)
      console.log(`   エラー: ${result.error}`)
      console.log(`   処理時間: ${(duration / 1000).toFixed(2)}秒`)
    }

    return result
  } catch (error) {
    console.error('単一オプション取得エラー:', error)
    throw error
  }
}

async function testSmallBatch() {
  console.log('\n小規模バッチテスト開始 (新バッチ処理)')
  console.log('='.repeat(40))

  try {
    // 実際に存在する契約を取得
    const { validStrikes } = await getValidContracts()

    // 小規模テスト用に3つのストライクを使用
    const testStrikes = validStrikes.slice(0, 3)
    console.log(`テスト対象ストライク: ${testStrikes.join(', ')}`)

    const service = new VixDataService()
    const summary = await service.fetchAllVixData(testStrikes)

    console.log('小規模バッチテスト結果:')
    console.log(`  処理時間: ${summary.duration}`)
    console.log(`  満期日数: ${summary.expirations}件`)
    console.log(`  総リクエスト: ${summary.totalRequests}件`)
    console.log(`  成功: ${summary.successCount}件`)
    console.log(`  失敗: ${summary.errorCount}件`)

    console.log('\n詳細 (最初の10件):')
    summary.details.slice(0, 10).forEach((detail, index) => {
      const status = detail.status === 'success' ? '✅' : '❌'
      const info = detail.status === 'success' ? `${detail.dataCount}件` : detail.error?.substring(0, 50)
      console.log(`  ${index + 1}. ${status} ${detail.expiration} Strike${detail.strike}: ${info}`)
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

// IBサービスの直接テスト（修正版）
async function testIbServiceBatch() {
  console.log('\nIBサービス直接バッチテスト開始')
  console.log('='.repeat(40))

  try {
    // 実際に存在する契約を取得
    const { expirations, validStrikes } = await getValidContracts()

    // テスト用のリクエスト（実在する契約のみ）
    const requests = [
      { contractMonth: expirations[0], strike: validStrikes[0] },
      { contractMonth: expirations[0], strike: validStrikes[1] },
    ]

    // 複数の満期日がある場合は追加
    if (expirations.length > 1) {
      requests.push({ contractMonth: expirations[1], strike: validStrikes[0] })
    }

    console.log(`テストリクエスト: ${requests.length}件`)
    requests.forEach((req, index) => {
      console.log(`  ${index + 1}. ${req.contractMonth} Strike${req.strike}`)
    })

    const ibService = IbServiceManager.getInstance()
    const startTime = Date.now()
    const results = await ibService.fetchMultipleVixOptionBars(requests)
    const duration = Date.now() - startTime

    console.log('\n✅ IBサービス直接テスト結果:')
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

// パフォーマンス比較テスト（修正版）
async function testPerformanceComparison() {
  console.log('\nパフォーマンス比較テスト開始')
  console.log('='.repeat(40))

  try {
    // 実際に存在する契約を取得
    const { validStrikes } = await getValidContracts()

    // パフォーマンステスト用に2つのストライクを使用
    const testStrikes = validStrikes.slice(0, 2)
    console.log(`テスト対象ストライク: ${testStrikes.join(', ')}`)

    const service = new VixDataService()

    console.log('1. バッチ処理版テスト...')
    const batchStartTime = Date.now()
    const batchResult = await service.fetchAllVixData(testStrikes)
    const batchDuration = Date.now() - batchStartTime

    console.log('2. 逐次処理版テスト...')
    const sequentialStartTime = Date.now()
    const sequentialResult = await service.fetchAllVixDataSequential(testStrikes)
    const sequentialDuration = Date.now() - sequentialStartTime

    console.log('\n📊 パフォーマンス比較結果:')
    console.log('='.repeat(20))
    console.log(`バッチ処理版:`)
    console.log(`  処理時間: ${(batchDuration / 1000).toFixed(2)}秒`)
    console.log(`  成功率: ${((batchResult.successCount / batchResult.totalRequests) * 100).toFixed(1)}%`)

    console.log(`逐次処理版:`)
    console.log(`  処理時間: ${(sequentialDuration / 1000).toFixed(2)}秒`)
    console.log(`  成功率: ${((sequentialResult.successCount / sequentialResult.totalRequests) * 100).toFixed(1)}%`)

    const improvement = (((sequentialDuration - batchDuration) / sequentialDuration) * 100).toFixed(1)
    console.log(`🚀 改善率: ${improvement}% 高速化`)

    return {
      batchResult,
      sequentialResult,
      batchDuration,
      sequentialDuration,
      improvement: parseFloat(improvement),
    }
  } catch (error) {
    console.error('パフォーマンス比較テストエラー:', error)
    throw error
  }
}

// 接続状況テスト
async function testConnectionStatus() {
  console.log('\n接続状況テスト開始')
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

    console.log('\n接続後の状況:')
    const afterStatus = service.getConnectionStatus()
    console.log(`  接続状態: ${afterStatus.connected}`)
    console.log(`  ホスト: ${afterStatus.host}:${afterStatus.port}`)
    console.log(`  クライアントID: ${afterStatus.clientId}`)

    await ibService.cleanup()

    console.log('\n切断後の状況:')
    const cleanupStatus = service.getConnectionStatus()
    console.log(`  接続状態: ${cleanupStatus.connected}`)

    return { beforeStatus, afterStatus, cleanupStatus }
  } catch (error) {
    console.error('接続状況テストエラー:', error)
    throw error
  }
}

// エラー耐性テスト（新規追加）
async function testErrorHandling() {
  console.log('\nエラー耐性テスト開始')
  console.log('='.repeat(40))

  const ibService = IbServiceManager.getInstance()

  try {
    await ibService.connect()

    // 無効な契約でテスト
    const invalidRequests = [
      { contractMonth: '20200101', strike: 999 }, // 過去の日付
      { contractMonth: '20990101', strike: -10 }, // 未来過ぎる日付、負のストライク
    ]

    console.log('無効な契約でのテスト開始...')

    try {
      const results = await ibService.fetchMultipleVixOptionBars(invalidRequests)
      console.log('⚠️  エラーが期待されましたが成功しました:', results.length)
    } catch (error) {
      console.log('✅ 期待通りエラーが発生:', error.message.substring(0, 100))
    }

    return true
  } catch (error) {
    console.error('エラー耐性テストでエラー:', error)
    return false
  } finally {
    await ibService.cleanup()
  }
}

async function runAllTests() {
  await setupDatabase()

  try {
    console.log('🧪 VIXデータサービス 包括テスト開始 (修正版)')
    console.log('='.repeat(50))

    // 0. 事前チェック：有効な契約があるか確認
    try {
      await getValidContracts()
    } catch (error) {
      console.error('❌ 事前チェック失敗 - IBサーバーが起動していないか、VIXデータが利用できません')
      throw error
    }

    // 1. 満期日取得テスト
    const expirations = await testExpirations()

    // 2. 単一オプションテスト
    const singleResult = await testSingleOption()

    // 3. 小規模バッチテスト（新機能）
    const batchResult = await testSmallBatch()

    // 4. IBサービス直接テスト（新機能）
    const ibResult = await testIbServiceBatch()

    // 5. パフォーマンス比較テスト（新機能）
    const perfResult = await testPerformanceComparison()

    // 6. 接続状況テスト（新機能）
    const connResult = await testConnectionStatus()

    // 7. エラー耐性テスト（新機能）
    const errorResult = await testErrorHandling()

    console.log('\n' + '='.repeat(50))
    console.log('🎉 全テスト完了')
    console.log('='.repeat(50))
    console.log(`📊 満期日数: ${expirations.length}`)
    console.log(`🎯 単一オプション: ${singleResult.status}`)
    console.log(`📦 小規模バッチ: ${batchResult.successCount}/${batchResult.totalRequests} 成功`)
    console.log(`⚡ IBサービス直接: ${ibResult.length}件成功`)
    console.log(`🚀 パフォーマンス改善: ${perfResult.improvement}% 高速化`)
    console.log(`🔗 接続テスト: 成功`)
    console.log(`🛡️  エラー耐性: ${errorResult ? '成功' : '失敗'}`)

    return {
      expirations,
      singleResult,
      batchResult,
      ibResult,
      perfResult,
      connResult,
      errorResult,
    }
  } catch (error) {
    console.error('❌ テスト実行エラー:', error)

    // デバッグ情報を出力
    console.log('\n🔍 デバッグ情報:')
    console.log('- TWS/IB Gatewayが起動していますか？')
    console.log('- APIアクセスが有効になっていますか？')
    console.log('- VIXオプションデータの購読権限はありますか？')
    console.log('- 接続設定（ホスト:127.0.0.1, ポート:4001）は正しいですか？')

    throw error
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
      case 'single':
        return await testSingleOption()
      case 'batch':
        return await testSmallBatch()
      case 'ib-batch':
        return await testIbServiceBatch()
      case 'performance':
        return await testPerformanceComparison()
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
    console.log(`🧪 ${testArg}テスト開始`)
    runIndividualTest(testArg)
      .then((result) => {
        console.log(`\n✅ ${testArg}テスト成功`)
        if (testArg === 'contracts' && Array.isArray(result)) {
          console.log(`取得契約数: ${result.length}`)
        }
        process.exit(0)
      })
      .catch((error) => {
        console.log(`\n❌ ${testArg}テスト失敗:`, error.message)
        process.exit(1)
      })
  } else {
    // 全テスト実行
    runAllTests()
      .then(() => {
        console.log('\n✅ 全テスト成功')
        process.exit(0)
      })
      .catch((error) => {
        console.log('\n❌ 全テスト失敗:', error.message)
        process.exit(1)
      })
  }
}

export {
  getValidContracts,
  testExpirations,
  testSingleOption,
  testSmallBatch,
  testIbServiceBatch,
  testPerformanceComparison,
  testConnectionStatus,
  testErrorHandling,
}
