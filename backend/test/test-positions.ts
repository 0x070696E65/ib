// test-positions.ts - 実際のポジション取得テスト
import { createIbServices } from '../services/ib-service'

async function testCurrentPositions() {
  const { positions, ib } = createIbServices()

  console.log('=== ポジション取得テスト開始 ===')

  try {
    console.log('IBサービスに接続中...')

    // 現在のポジションを取得
    const currentPositions = await positions.getCurrentPositions()

    console.log(`\n✅ ポジション取得成功: ${currentPositions.length}件`)

    if (currentPositions.length > 0) {
      console.log('\n--- ポジション一覧 ---')
      currentPositions.forEach((pos, index) => {
        console.log(`${index + 1}. ${pos.symbol} (${pos.secType})`)
        console.log(`   アカウント: ${pos.account}`)
        console.log(`   シンボル: ${pos.symbol}`)
        console.log(`   証券種別: ${pos.secType}`)
        console.log(`   取引所: ${pos.exchange}`)
        console.log(`   通貨: ${pos.currency}`)
        console.log(`   ポジション: ${pos.position}`)
        console.log(`   平均価格: ${pos.avgCost.toFixed(2)}`)
        console.log(`   市場価値: ${pos.marketValue?.toFixed(2) || 'N/A'}`)
        console.log(`   契約ID: ${pos.contractId || 'N/A'}`)
        console.log(`   ローカルシンボル: ${pos.localSymbol || 'N/A'}`)
        console.log('')

        // オプションの場合は詳細情報を追加
        if (pos.secType === 'OPT' && pos.localSymbol) {
          const strike = positions.extractStrikeFromLocalSymbol(pos.localSymbol)
          const expiry = positions.extractExpiryFromLocalSymbol(pos.localSymbol)
          const optionType = positions.extractOptionType(pos.localSymbol)

          if (strike !== null) {
            console.log(`   ストライク: ${strike}`)
          }
          if (expiry) {
            console.log(`   満期: 20${expiry}`)
          }
          if (optionType) {
            console.log(`   オプション種別: ${optionType}`)
          }
        }
      })

      // VIXポジションがあるかチェック
      const vixPositions = currentPositions.filter((pos) => pos.symbol === 'VIX')
      if (vixPositions.length > 0) {
        console.log(`🎯 VIXポジション: ${vixPositions.length}件`)

        const vixOptions = vixPositions.filter((pos) => pos.secType === 'OPT')
        const vixFutures = vixPositions.filter((pos) => pos.secType === 'FUT')

        if (vixOptions.length > 0) {
          console.log(`   VIXオプション: ${vixOptions.length}件`)
        }
        if (vixFutures.length > 0) {
          console.log(`   VIX先物: ${vixFutures.length}件`)
        }
      }
    } else {
      console.log('📝 現在ポジションはありません')
    }

    // 接続状況も表示
    const connectionInfo = ib.getConnectionInfo()
    console.log('\n--- 接続情報 ---')
    console.log(`ホスト: ${connectionInfo.host}:${connectionInfo.port}`)
    console.log(`クライアントID: ${connectionInfo.clientId}`)
    console.log(`接続状態: ${connectionInfo.connected ? '✅ 接続中' : '❌ 未接続'}`)
  } catch (error) {
    console.error('❌ エラー発生:', error)

    if (error instanceof Error) {
      if (error.message.includes('接続')) {
        console.log('\n💡 確認事項:')
        console.log('1. TWS または IB Gateway が起動しているか')
        console.log('2. API接続が有効になっているか（TWS設定 > API > Enable ActiveX and Socket Clients）')
        console.log('3. ポート番号が正しいか（TWS: 7497, IB Gateway: 4001/4002）')
      }
    }
  } finally {
    // クリーンアップ
    try {
      await ib.cleanup()
      console.log('\n🧹 接続をクリーンアップしました')
    } catch (cleanupError) {
      console.warn('クリーンアップエラー:', cleanupError)
    }
  }
}

// 実行
console.log('Interactive Brokers ポジション取得テスト')
console.log('Ctrl+C で終了\n')

testCurrentPositions()
  .then(() => {
    console.log('\n✅ テスト完了')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ テスト失敗:', error)
    process.exit(1)
  })
