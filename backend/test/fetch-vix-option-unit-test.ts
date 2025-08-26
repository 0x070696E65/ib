// test/fetch-vix-option-unit-test.ts
import { IbService } from '../ibService'

async function testFetchVixOptionBars() {
  console.log('fetchVixOptionBars 単体テスト開始')
  console.log('='.repeat(50))

  // 修正版IbServiceを使用
  const ibService = new IbService(4001, '127.0.0.1', 101)

  try {
    console.log('設定情報:')
    console.log('  契約月: 20250916')
    console.log('  ストライク: 18')
    console.log('  期間: 360日')
    console.log('  バーサイズ: 4時間')
    console.log('')

    const startTime = Date.now()

    const result = await ibService.fetchVixOptionBars('20250916', 18)

    const duration = Date.now() - startTime

    console.log(`履歴データ取得成功! (${duration}ms)`)
    console.log(`契約: ${result.contract}`)
    console.log(`ストライク: ${result.strike}`)
    console.log(`データ件数: ${result.data.length}`)

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
    }

    return result
  } catch (error) {
    console.error('テストエラー:', error instanceof Error ? error.message : error)
    throw error
  } finally {
    // 接続は自動切断されるはず（disconnect削除したため）
    console.log('テスト完了')
  }
}

if (require.main === module) {
  testFetchVixOptionBars()
    .then((result) => {
      console.log('')
      console.log('🎉 fetchVixOptionBars単体テスト成功!')
      console.log(`取得データ: ${result.data.length}件`)
      process.exit(0)
    })
    .catch((error) => {
      console.log('')
      console.log('💥 fetchVixOptionBars単体テスト失敗')

      if (error.message.includes('タイムアウト')) {
        console.log('原因: 履歴データ取得タイムアウト')
        console.log('対策: Historical Data Farmの状態確認')
      } else if (error.message.includes('接続')) {
        console.log('原因: IB接続問題')
        console.log('対策: IB Gateway再起動')
      } else {
        console.log('原因: その他のエラー')
      }

      process.exit(1)
    })
}
