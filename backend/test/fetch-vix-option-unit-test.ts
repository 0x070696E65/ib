// test/fetch-vix-option-unit-test.ts
import { IbService } from '../services/IbService'
import { ExpirationService } from '../services/ExpirationService'
interface TestResult {
  duration: string
  dataPoints: number
  success: boolean
  error?: string
  executionTime: number
  firstDate?: Date
  lastDate?: Date
}

async function testSingleDuration(durationDays: number, contractMonth: string, strike: number): Promise<TestResult> {
  const ibService = new IbService(4001, '127.0.0.1', 101)
  const startTime = Date.now()

  try {
    console.log(`\n📊 ${durationDays}日間テスト開始`)
    console.log(`   契約: ${contractMonth}, ストライク: ${strike}`)

    const result = await ibService.fetchVixOptionBars(contractMonth, strike, durationDays)
    const executionTime = Date.now() - startTime

    const firstDate = result.data.length > 0 ? result.data[0].date : undefined
    const lastDate = result.data.length > 0 ? result.data[result.data.length - 1].date : undefined

    console.log(`✅ ${durationDays}日間テスト成功!`)
    console.log(`   データ件数: ${result.data.length}`)
    console.log(`   実行時間: ${executionTime}ms`)
    if (firstDate && lastDate) {
      console.log(`   期間: ${firstDate.toISOString().split('T')[0]} ～ ${lastDate.toISOString().split('T')[0]}`)
    }

    await ibService.cleanup()

    return {
      duration: `${durationDays}D`,
      dataPoints: result.data.length,
      success: true,
      executionTime,
      firstDate,
      lastDate,
    }
  } catch (error) {
    const executionTime = Date.now() - startTime
    const errorMsg = error instanceof Error ? error.message : String(error)

    console.log(`❌ ${durationDays}日間テスト失敗`)
    console.log(`   エラー: ${errorMsg}`)
    console.log(`   実行時間: ${executionTime}ms`)

    await ibService.cleanup()

    return {
      duration: `${durationDays}D`,
      dataPoints: 0,
      success: false,
      error: errorMsg,
      executionTime,
    }
  }
}

async function testMultipleDurations() {
  console.log('🧪 VIXオプション日数別取得テスト開始')
  console.log('='.repeat(60))

  // まず有効な契約を確認
  console.log('📋 有効な契約を確認中...')
  const ibService = new IbService(4001, '127.0.0.1', 100)

  let contractMonth: string
  let strike: number = 18

  try {
    const expirationService = ExpirationService.getInstance()
    const expirations = await expirationService.getExpirations()

    if (expirations.length === 0) {
      throw new Error('有効な満期日が見つかりません')
    }
    contractMonth = expirations[0]
    console.log(`✅ 使用する契約: ${contractMonth}, ストライク: ${strike}`)
  } catch (error) {
    console.error('❌ 契約確認エラー:', error)
    return
  } finally {
    await ibService.cleanup()
  }

  // テスト対象の期間設定
  const testDurations = [
    { days: 1, description: '1日 (最小負荷)' },
    { days: 7, description: '1週間 (週次更新)' },
    { days: 30, description: '1ヶ月 (月次更新)' },
    { days: 90, description: '3ヶ月 (四半期)' },
    { days: 360, description: '1年 (初期読み込み)' },
  ]

  const results: TestResult[] = []

  console.log('\n🚀 各期間でのテスト実行開始...')

  for (const test of testDurations) {
    console.log(`\n${'='.repeat(30)}`)
    console.log(`📈 ${test.description} テスト`)
    console.log(`${'='.repeat(30)}`)

    const result = await testSingleDuration(test.days, contractMonth, strike)
    results.push(result)

    // 各テストの間に少し間隔を空ける
    if (test.days < 360) {
      console.log('   (2秒待機...)')
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }

  // 結果サマリー
  console.log('\n' + '='.repeat(60))
  console.log('📊 テスト結果サマリー')
  console.log('='.repeat(60))

  const successResults = results.filter((r) => r.success)
  const failedResults = results.filter((r) => !r.success)

  console.log(`✅ 成功: ${successResults.length}/${results.length}`)
  console.log(`❌ 失敗: ${failedResults.length}/${results.length}`)

  if (successResults.length > 0) {
    console.log('\n📈 成功したテストの詳細:')
    console.log('期間     | データ件数 | 実行時間 | データ範囲')
    console.log('-'.repeat(55))

    successResults.forEach((result) => {
      const dateRange =
        result.firstDate && result.lastDate
          ? `${result.firstDate.toISOString().split('T')[0]} ～ ${result.lastDate.toISOString().split('T')[0]}`
          : 'N/A'

      console.log(
        `${result.duration.padEnd(8)} | ${String(result.dataPoints).padEnd(10)} | ${String(result.executionTime).padEnd(
          8
        )}ms | ${dateRange}`
      )
    })

    // パフォーマンス分析
    console.log('\n🚀 パフォーマンス分析:')
    const fastest = successResults.reduce((prev, curr) => (prev.executionTime < curr.executionTime ? prev : curr))
    const slowest = successResults.reduce((prev, curr) => (prev.executionTime > curr.executionTime ? prev : curr))
    const mostData = successResults.reduce((prev, curr) => (prev.dataPoints > curr.dataPoints ? prev : curr))
    const leastData = successResults.reduce((prev, curr) => (prev.dataPoints < curr.dataPoints ? prev : curr))

    console.log(`   最速: ${fastest.duration} (${fastest.executionTime}ms)`)
    console.log(`   最遅: ${slowest.duration} (${slowest.executionTime}ms)`)
    console.log(`   最多データ: ${mostData.duration} (${mostData.dataPoints}件)`)
    console.log(`   最少データ: ${leastData.duration} (${leastData.dataPoints}件)`)

    // 効率性の計算
    const oneDay = successResults.find((r) => r.duration === '1D')
    const oneYear = successResults.find((r) => r.duration === '360D')

    if (oneDay && oneYear) {
      const speedImprovement = (((oneYear.executionTime - oneDay.executionTime) / oneYear.executionTime) * 100).toFixed(
        1
      )
      const dataReduction = (((oneYear.dataPoints - oneDay.dataPoints) / oneYear.dataPoints) * 100).toFixed(1)

      console.log('\n💡 1日 vs 360日の比較:')
      console.log(`   実行時間改善: ${speedImprovement}% 短縮`)
      console.log(`   データ量削減: ${dataReduction}% 削減`)
    }
  }

  if (failedResults.length > 0) {
    console.log('\n❌ 失敗したテストの詳細:')
    failedResults.forEach((result) => {
      console.log(`   ${result.duration}: ${result.error}`)
    })
  }

  console.log('\n💡 推奨設定:')
  if (successResults.find((r) => r.duration === '1D')) {
    console.log('   ✅ 毎日更新: 1日データ取得 (最高効率)')
  }
  if (successResults.find((r) => r.duration === '7D')) {
    console.log('   ✅ 週次更新: 7日データ取得 (バランス良好)')
  }
  if (successResults.find((r) => r.duration === '360D')) {
    console.log('   ✅ 初期読み込み: 360日データ取得 (履歴取得)')
  }

  return results
}

async function testSpecificDuration(durationDays: number) {
  console.log(`🎯 ${durationDays}日間 単体テスト開始`)
  console.log('='.repeat(50))

  const ibService = new IbService(4001, '127.0.0.1', 102)

  try {
    // 有効な契約を取得
    const expirationService = ExpirationService.getInstance()
    const expirations = await expirationService.getExpirations()
    if (expirations.length === 0) {
      throw new Error('有効な満期日が見つかりません')
    }

    const contractMonth = expirations[0]
    const strike = 18

    console.log('設定情報:')
    console.log(`  契約月: ${contractMonth}`)
    console.log(`  ストライク: ${strike}`)
    console.log(`  期間: ${durationDays}日`)
    console.log(`  バーサイズ: 4時間`)
    console.log('')

    await ibService.cleanup() // 一度切断

    const startTime = Date.now()
    const result = await ibService.fetchVixOptionBars(contractMonth, strike, durationDays)
    const duration = Date.now() - startTime

    console.log(`✅ 履歴データ取得成功! (${duration}ms)`)
    console.log(`契約: ${result.contract}`)
    console.log(`ストライク: ${result.strike}`)
    console.log(`データ件数: ${result.data.length}`)
    console.log(`リクエスト期間: ${result.requestedDuration}`)

    if (result.data.length > 0) {
      console.log('')
      console.log('最新5件のデータ:')
      result.data.slice(-5).forEach((bar, index) => {
        const dateStr = bar.date.toISOString().slice(0, 19).replace('T', ' ')
        console.log(`  ${index + 1}. ${dateStr} - 終値: ${bar.close}`)
      })

      console.log('')
      console.log('最古5件のデータ:')
      result.data.slice(0, 5).forEach((bar, index) => {
        const dateStr = bar.date.toISOString().slice(0, 19).replace('T', ' ')
        console.log(`  ${index + 1}. ${dateStr} - 終値: ${bar.close}`)
      })

      // データ期間の分析
      const firstDate = result.data[0].date
      const lastDate = result.data[result.data.length - 1].date
      const actualDays = Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24))

      console.log('')
      console.log('📊 データ分析:')
      console.log(`  実際の期間: ${actualDays}日`)
      console.log(`  データ密度: ${(result.data.length / actualDays).toFixed(2)} データ/日`)
      console.log(`  期間効率: ${((actualDays / durationDays) * 100).toFixed(1)}%`)
    }

    await ibService.cleanup()
    return result
  } catch (error) {
    console.error('テストエラー:', error instanceof Error ? error.message : error)
    await ibService.cleanup()
    throw error
  }
}

// コマンドライン引数処理
if (require.main === module) {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    // 全期間テスト
    testMultipleDurations()
      .then((results) => {
        if (results == undefined) return
        const successCount = results.filter((r) => r.success).length
        console.log(`\n🎉 複数期間テスト完了! (${successCount}/${results.length} 成功)`)
        process.exit(0)
      })
      .catch((error) => {
        console.log('\n💥 複数期間テスト失敗:', error.message)
        process.exit(1)
      })
  } else if (args[0] && !isNaN(Number(args[0]))) {
    // 特定期間テスト
    const durationDays = Number(args[0])
    testSpecificDuration(durationDays)
      .then((result) => {
        console.log(`\n🎉 ${durationDays}日間テスト成功! (${result.data.length}件取得)`)
        process.exit(0)
      })
      .catch((error) => {
        console.log(`\n💥 ${durationDays}日間テスト失敗:`, error.message)
        process.exit(1)
      })
  } else {
    console.log('使用方法:')
    console.log('  npm run test:duration        # 全期間テスト')
    console.log('  npm run test:duration 1      # 1日テスト')
    console.log('  npm run test:duration 7      # 7日テスト')
    console.log('  npm run test:duration 30     # 30日テスト')
    process.exit(1)
  }
}
