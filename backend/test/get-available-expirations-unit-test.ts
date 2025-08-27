// test/get-available-expirations-unit-test.ts
import { ExpirationService } from '../services/ExpirationService'

async function testGetAvailableExpirations() {
  console.log('getAvailableExpirations 単体テスト開始')
  console.log('='.repeat(50))

  try {
    console.log('リクエスト設定:')
    console.log('  シンボル: VIX')
    console.log('  セクション: オプション')
    console.log('  取得対象: 満期日一覧')
    console.log('')

    const startTime = Date.now()

    const expirationService = ExpirationService.getInstance()
    const expirations = await expirationService.getExpirations()
    const duration = Date.now() - startTime

    console.log(`満期日取得成功! (${duration}ms)`)
    console.log(`取得件数: ${expirations.length}`)

    if (expirations.length > 0) {
      console.log('')
      console.log('最新5件の満期日:')
      expirations.slice(-5).forEach((expiry, index) => {
        console.log(`  ${index + 1}. ${expiry}`)
      })

      console.log('')
      console.log('最古5件の満期日:')
      expirations.slice(0, 5).forEach((expiry, index) => {
        console.log(`  ${index + 1}. ${expiry}`)
      })
    }

    return expirations
  } catch (error) {
    console.error('テストエラー:', error instanceof Error ? error.message : error)
    throw error
  } finally {
    console.log('テスト完了')
  }
}

if (require.main === module) {
  testGetAvailableExpirations()
    .then((expirations) => {
      console.log('')
      console.log('🎉 getAvailableExpirations単体テスト成功!')
      console.log(`取得データ: ${expirations.length}件`)
      process.exit(0)
    })
    .catch((error) => {
      console.log('')
      console.log('💥 getAvailableExpirations単体テスト失敗')

      if (error.message.includes('タイムアウト')) {
        console.log('原因: 満期日取得タイムアウト')
        console.log('対策: Contract Details API 応答を確認')
      } else if (error.message.includes('接続')) {
        console.log('原因: IB接続問題')
        console.log('対策: IB Gateway/TWSを再起動')
      } else {
        console.log('原因: その他のエラー')
      }

      process.exit(1)
    })
}
