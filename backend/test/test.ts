import { IbService } from '../ibService'

async function simpleTest() {
  const ibService = new IbService(4001, '127.0.0.1', 100)

  try {
    console.log('\n1. 接続開始...')
    await ibService.connect()
    console.log('✅ 接続成功')

    console.log('2. VIX満期日取得中...')
    const expirations = await ibService.getAvailableExpirations()
    console.log(`✅ 取得成功: ${expirations.length}件`)

    console.log('\n📅 取得した満期日:')
    expirations.forEach((expiry, index) => {
      console.log(`   ${index + 1}. ${expiry}`)
    })

    console.log(`\n📊 合計: ${expirations.length}件の満期日`)

    return expirations
  } catch (error) {
    console.error('❌ エラー:', error instanceof Error ? error.message : error)

    throw error
  } finally {
    console.log('\n3. 切断中...')
    await ibService.disconnect()
    console.log('✅ 切断完了')
  }
}

if (require.main === module) {
  simpleTest()
    .then((result) => {
      console.log('\n🎉 テスト成功!')
      process.exit(0)
    })
    .catch((error) => {
      console.log('\n💥 テスト失敗')
      process.exit(1)
    })
}
