// test/simple-api-call-test.ts
import { IBApi, EventName, IBApiCreationOptions } from '@stoqey/ib'

async function simpleApiCallTest() {
  console.log('シンプルAPIコールテスト開始')
  console.log('='.repeat(40))

  const ib = new IBApi({ port: 4001, clientId: 100 })
  let connected = false

  return new Promise<void>((resolve, reject) => {
    let testTimeout: NodeJS.Timeout

    // 接続成功
    ib.on(EventName.connected, () => {
      connected = true
      console.log('✅ 接続成功！')

      // 最もシンプルなAPIコールを試す
      console.log('nextValidIdをリクエスト中...')
      ib.reqIds(-1) // nextValidIdをリクエスト
    })

    // nextValidId応答
    ib.on(EventName.nextValidId, (reqId) => {
      console.log(`✅ nextValidId受信: ${reqId}`)
      console.log('APIコール成功！')

      // 成功したので切断
      setTimeout(() => {
        console.log('切断開始...')
        ib.disconnect()
      }, 1000)
    })

    // 切断
    ib.on(EventName.disconnected, () => {
      console.log('✅ 切断完了')
      if (testTimeout) clearTimeout(testTimeout)
      resolve()
    })

    // エラー
    ib.on(EventName.error, (err, code, id) => {
      console.error(`❌ エラー: ${err}, Code: ${code}, ID: ${id}`)
      if (!connected) {
        reject(new Error(`接続エラー: ${err}`))
      } else {
        console.log('APIコール後のエラー - 継続')
      }
    })

    // 全体のタイムアウト (15秒)
    testTimeout = setTimeout(() => {
      console.log('❌ テストタイムアウト (15秒)')
      ib.disconnect()
      reject(new Error('テストタイムアウト'))
    }, 15000)

    // 接続開始
    console.log('接続開始: ClientID 100')
    ib.connect()
  })
}

if (require.main === module) {
  simpleApiCallTest()
    .then(() => {
      console.log('\n🎉 シンプルAPIコールテスト成功!')
      console.log('基本的なAPIコールは動作している')
      process.exit(0)
    })
    .catch((error) => {
      console.log('\n💥 シンプルAPIコールテスト失敗')
      console.error('エラー:', error.message)
      process.exit(1)
    })
}
