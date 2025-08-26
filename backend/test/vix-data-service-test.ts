// test/vix-data-service-test.ts
import mongoose from 'mongoose'
import { VixDataService } from '../services/VixDataService'

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

async function testExpirations() {
  console.log('満期日取得テスト開始')
  console.log('='.repeat(40))

  const service = new VixDataService()

  try {
    const expirations = await service.getAndSaveExpirations()

    console.log('満期日取得成功:')
    expirations.forEach((exp, index) => {
      console.log(`  ${index + 1}. ${exp}`)
    })
    console.log(`合計: ${expirations.length}件`)

    return expirations
  } catch (error) {
    console.error('満期日取得エラー:', error)
    throw error
  }
}

async function testSingleOption() {
  console.log('\n単一オプションデータ取得テスト開始')
  console.log('='.repeat(40))

  const service = new VixDataService()
  const expiration = '20250916'
  const strike = 18

  try {
    console.log(`テスト対象: ${expiration} Strike${strike}`)

    const result = await service.fetchAndSaveOptionData(expiration, strike)

    if (result.status === 'success') {
      console.log(`単一オプション取得成功:`)
      console.log(`  満期日: ${result.expiration}`)
      console.log(`  ストライク: ${result.strike}`)
      console.log(`  データ件数: ${result.dataCount}`)
    } else {
      console.log(`単一オプション取得失敗:`)
      console.log(`  エラー: ${result.error}`)
    }

    return result
  } catch (error) {
    console.error('単一オプション取得エラー:', error)
    throw error
  }
}

async function testSmallBatch() {
  console.log('\n小規模バッチテスト開始')
  console.log('='.repeat(40))

  const service = new VixDataService()
  const expiration = '20250916'
  const strikes = [18, 19, 20]

  try {
    console.log(`テスト対象: ${expiration}`)
    console.log(`ストライク: ${strikes.join(', ')}`)

    const summary = await service.fetchTestData(expiration, strikes)

    console.log('小規模バッチテスト結果:')
    console.log(`  処理時間: ${summary.duration}`)
    console.log(`  成功: ${summary.successCount}件`)
    console.log(`  失敗: ${summary.errorCount}件`)

    console.log('\n詳細:')
    summary.details.forEach((detail, index) => {
      const status = detail.status === 'success' ? '✅' : '❌'
      const info = detail.status === 'success' ? `${detail.dataCount}件` : detail.error
      console.log(`  ${index + 1}. ${status} Strike${detail.strike}: ${info}`)
    })

    return summary
  } catch (error) {
    console.error('小規模バッチテストエラー:', error)
    throw error
  }
}

async function runAllTests() {
  await setupDatabase()

  try {
    // 1. 満期日取得テスト
    const expirations = await testExpirations()

    // 2. 単一オプションテスト
    const singleResult = await testSingleOption()

    // 3. 小規模バッチテスト
    const batchResult = await testSmallBatch()

    console.log('\n' + '='.repeat(40))
    console.log('全テスト完了')
    console.log(`満期日数: ${expirations.length}`)
    console.log(`単一オプション: ${singleResult.status}`)
    console.log(`小規模バッチ: ${batchResult.successCount}/${batchResult.totalRequests} 成功`)
  } catch (error) {
    console.error('テスト実行エラー:', error)
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
      case 'expirations':
        return await testExpirations()
      case 'single':
        return await testSingleOption()
      case 'batch':
        return await testSmallBatch()
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
    runIndividualTest(testArg)
      .then(() => {
        console.log(`\n${testArg}テスト成功`)
        process.exit(0)
      })
      .catch((error) => {
        console.log(`\n${testArg}テスト失敗`)
        process.exit(1)
      })
  } else {
    // 全テスト実行
    runAllTests()
      .then(() => {
        console.log('\n全テスト成功')
        process.exit(0)
      })
      .catch((error) => {
        console.log('\n全テスト失敗')
        process.exit(1)
      })
  }
}

export { testExpirations, testSingleOption, testSmallBatch }
