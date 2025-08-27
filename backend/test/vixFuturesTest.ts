import { IbServiceManager } from '../services/IbService'

async function testVixFutures() {
  console.log('=== VIX先物データ取得テスト開始 ===')

  const ibService = IbServiceManager.getInstance()

  try {
    // テスト1: 単一契約のデータ取得
    console.log('\n--- テスト1: 単一VIX先物データ取得 ---')
    const singleResult = await ibService.fetchVixFutureBars('20250917', 90) // 3ヶ月分

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
    const contractMonths = ['20250917', '20251022', '20251119']
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
    // クリーンアップ
    console.log('\n--- クリーンアップ ---')
    await ibService.cleanup()
    console.log('=== VIX先物データ取得テスト完了 ===')
  }
}

// パフォーマンステスト用
async function performanceTest() {
  console.log('=== パフォーマンステスト ===')

  const ibService = IbServiceManager.getInstance()
  const startTime = Date.now()

  try {
    // 6ヶ月分の契約を取得
    const contracts = ['20250917', '20251022', '20251119', '20251217', '20260121', '20260218']
    const results = await ibService.fetchMultipleVixFutureBars(contracts, 30)

    const endTime = Date.now()
    const duration = (endTime - startTime) / 1000

    console.log(`実行時間: ${duration.toFixed(2)}秒`)
    console.log(`取得契約数: ${results.length}`)
    console.log(`平均処理時間: ${(duration / results.length).toFixed(2)}秒/契約`)

    const totalDataPoints = results.reduce((sum, r) => sum + r.actualDataPoints!, 0)
    console.log(`総データポイント数: ${totalDataPoints}`)
  } catch (error) {
    console.error('パフォーマンステストエラー:', error)
  } finally {
    await ibService.cleanup()
  }
}

// テスト実行
if (require.main === module) {
  testVixFutures()
    .then(() => {
      console.log('\n基本テスト完了。パフォーマンステストを実行しますか？')
      performanceTest()
    })
    .catch(console.error)
}

export { testVixFutures, performanceTest }
