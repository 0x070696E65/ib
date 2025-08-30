// test-backend-positions.ts - バックエンド単体テスト
import { RealtimePositionService } from '../services/ib-service/RealtimePositionService'
import { createIbServices } from '../services/ib-service'

async function testRealtimePositionService() {
  console.log('=== リアルタイムポジションサービステスト開始 ===\n')

  const { ib } = createIbServices()
  const realtimeService = new RealtimePositionService(ib)

  // イベントリスナーを設定
  realtimeService.on('positionsUpdated', (positions) => {
    console.log('\n📊 ポジション更新:')
    console.log(`件数: ${positions.length}`)
    positions.forEach((pos: any, index: any) => {
      console.log(`  ${index + 1}. ${pos.symbol} (${pos.secType}) - ${pos.position}`)
      if (pos.strike) {
        console.log(`     ストライク: ${pos.strike}, 満期: ${pos.expiry}, 種別: ${pos.optionType}`)
      }
      if (pos.unrealizedPnL !== undefined) {
        console.log(`     含み損益: $${pos.unrealizedPnL.toFixed(2)}`)
      }
    })
  })

  realtimeService.on('pnlUpdated', (pnlData) => {
    console.log(`\n💰 PnL更新: ID=${pnlData.contractId}`)
    console.log(`  日次: $${pnlData.dailyPnL?.toFixed(2) || 'N/A'}`)
    console.log(`  含み損益: $${pnlData.unrealizedPnL?.toFixed(2) || 'N/A'}`)
    console.log(`  実現損益: $${pnlData.realizedPnL?.toFixed(2) || 'N/A'}`)
    console.log(`  価値: $${pnlData.value?.toFixed(2) || 'N/A'}`)
  })

  realtimeService.on('marketClosed', (marketStatus) => {
    console.log('\n🔒 市場閉場中', marketStatus)
  })

  realtimeService.on('connectionError', (error) => {
    console.log('\n❌ 接続エラー:', error)
  })

  realtimeService.on('monitoringStarted', () => {
    console.log('\n✅ 監視開始')
  })

  realtimeService.on('monitoringStopped', () => {
    console.log('\n⏹️  監視停止')
  })

  try {
    // 監視開始
    console.log('監視を開始します...')
    await realtimeService.startMonitoring()

    // 30秒間監視
    console.log('30秒間監視します... (Ctrl+C で強制終了)')

    // 定期的にステータス表示
    const statusInterval = setInterval(() => {
      const status = realtimeService.getStatus()
      console.log(
        `\n📈 ステータス: 監視中=${status.isMonitoring}, ポジション=${status.positionCount}, PnL購読=${
          status.pnlSubscriptions
        }, 市場=${status.marketStatus.isOpen ? '開場' : '閉場'}`
      )
    }, 10000) // 10秒ごと

    // 30秒後に停止
    setTimeout(() => {
      clearInterval(statusInterval)
      realtimeService.stopMonitoring()

      // 最終結果表示
      console.log('\n=== 最終結果 ===')
      const finalPositions = realtimeService.getCurrentPositions()
      console.log(`取得ポジション数: ${finalPositions.length}`)

      const vixPositions = finalPositions.filter((p) => p.symbol === 'VIX')
      console.log(`VIXポジション数: ${vixPositions.length}`)

      if (vixPositions.length > 0) {
        console.log('\nVIXポジション詳細:')
        vixPositions.forEach((pos, i) => {
          console.log(`  ${i + 1}. ${pos.localSymbol}`)
          console.log(`     ポジション: ${pos.position}`)
          console.log(`     平均価格: $${pos.avgCost.toFixed(2)}`)
          if (pos.unrealizedPnL !== undefined) {
            const sign = pos.unrealizedPnL >= 0 ? '+' : ''
            console.log(`     含み損益: ${sign}$${pos.unrealizedPnL.toFixed(2)}`)
          }
        })
      }

      process.exit(0)
    }, 30000)
  } catch (error) {
    console.error('\n❌ テストエラー:', error)

    if (error instanceof Error) {
      if (error.message.includes('接続')) {
        console.log('\n💡 確認事項:')
        console.log('1. TWS または IB Gateway が起動している')
        console.log('2. API接続が有効になっている')
        console.log('3. ポート番号が正しい (TWS: 7497, IB Gateway: 4001/4002)')
      }
    }

    process.exit(1)
  }
}

// HTTPテスト関数
async function testHTTPEndpoints() {
  console.log('\n=== HTTP API テスト ===')

  const baseUrl = 'http://localhost:3001/api/positions'

  try {
    // ヘルスチェック
    console.log('1. ヘルスチェック...')
    const healthRes = await fetch('http://localhost:3001/api/health')
    const healthData = await healthRes.json()
    console.log('   ✅', healthData.message)

    // 静的ポジション取得
    console.log('2. 静的ポジション取得...')
    const staticRes = await fetch(`${baseUrl}/current`)
    const staticData = await staticRes.json()
    console.log(`   📊 ポジション数: ${staticData.data.positions.length}`)

    // 統計情報取得
    console.log('3. 統計情報取得...')
    const statsRes = await fetch(`${baseUrl}/stats`)
    const statsData = await statsRes.json()
    console.log('   📈 接続数:', statsData.activeConnections)

    // 監視開始テスト
    console.log('4. 監視制御テスト...')
    const controlRes = await fetch(`${baseUrl}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    })
    const controlData = await controlRes.json()
    console.log('   ✅', controlData.message)

    console.log('\n✅ HTTP API テスト完了')
  } catch (error) {
    console.error('❌ HTTP テストエラー:', error)
    console.log('💡 サーバーが起動していることを確認してください: npm run dev')
  }
}

// メイン実行
async function main() {
  const args = process.argv.slice(2)

  if (args.includes('--http') || args.includes('-h')) {
    await testHTTPEndpoints()
  } else {
    await testRealtimePositionService()
  }
}

// 実行
console.log('リアルタイムポジションサービス - バックエンドテスト')
console.log('使用法:')
console.log('  npm run test:positions        # リアルタイム監視テスト')
console.log('  npm run test:positions --http # HTTP API テスト')
console.log('')

main().catch(console.error)
