// backend/test/test-api-integration.ts
import axios from 'axios'
import { connectToDatabase } from '../database/connection'
import { TradeOrder } from '../models/TradeOrder'
import * as dotenv from 'dotenv'

dotenv.config()

const API_BASE = 'http://localhost:3001/api/trades'

async function testAPIIntegration() {
  console.log('=== API インテグレーションテスト開始 ===')

  try {
    await connectToDatabase()
    console.log('✅ MongoDB接続成功')

    // サーバーが起動しているかチェック
    console.log('\n🔍 サーバー接続テスト...')
    try {
      await axios.get('http://localhost:3001/api/health')
      console.log('✅ サーバー起動確認')
    } catch (error) {
      console.error('❌ サーバーが起動していません。npm run dev を実行してください')
      return
    }

    // 1. データインポートテスト
    console.log('\n📥 Flex Query データインポートテスト...')
    try {
      const importResponse = await axios.post(`${API_BASE}/import-flex-data`)
      console.log('✅ インポート成功:', importResponse.data.message)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorData = (error as any).response?.data
      console.error('❌ インポートエラー:', errorData || errorMessage)
      console.log('💡 環境変数 IB_FLEX_TOKEN, IB_FLEX_QUERY_ID を確認してください')
    }

    // データベース内容確認
    const orderCount = await TradeOrder.countDocuments()
    console.log(`📊 データベース内の発注数: ${orderCount}件`)

    if (orderCount === 0) {
      console.log('⚠️  データがないため、以降のテストをスキップします')
      return
    }

    // 2. ポジションマッチングテスト
    console.log('\n🔄 ポジションマッチングテスト...')
    try {
      const matchResponse = await axios.get(`${API_BASE}/position-matching`)
      const matchData = matchResponse.data.data

      console.log('✅ マッチング成功')
      console.log(`   総ポジション数: ${matchData.totalPositions}`)
      console.log(`   マッチング成功: ${matchData.matchedPositions}`)
      console.log(`   マッチング率: ${((matchData.matchedPositions / matchData.totalPositions) * 100).toFixed(1)}%`)

      // マッチング結果の詳細表示
      if (matchData.results.length > 0) {
        console.log('現在のポジション詳細:')
        matchData.results.slice(0, 3).forEach((result: any, index: number) => {
          const pos = result.position
          console.log(`${index + 1}:`)
          console.log(`  symbol: ${pos.symbol}`)
          console.log(`  localSymbol: ${pos.localSymbol}`)
          console.log(`  strike: ${pos.strike}`)
          console.log(`  expiry: ${pos.expiry}`)
          console.log(`  optionType: ${pos.optionType}`)
          console.log(`  secType: ${pos.secType}`)
        })

        console.log('\n--- マッチング詳細 (最初の5件) ---')
        matchData.results.slice(0, 5).forEach((result: any, index: number) => {
          const pos = result.position
          console.log(`${index + 1}. ${pos.symbol} ${pos.strike}${pos.optionType} ${pos.expiry}`)
          console.log(`   マッチング: ${result.matched ? '✅' : '❌'}`)
          if (result.matched && result.tradeOrder) {
            console.log(`   発注ID: ${result.tradeOrder.orderID}`)
            console.log(`   タグ: ${result.tradeOrder.tag || 'なし'}`)
          }
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorData = (error as any).response?.data
      console.error('❌ マッチングエラー:', errorData || errorMessage)
    }

    // 3. 分析データテスト
    console.log('\n📈 分析データテスト...')
    try {
      const analysisResponse = await axios.get(`${API_BASE}/analysis`)
      const analysisData = analysisResponse.data.data

      console.log('✅ 分析データ取得成功')
      console.log(`   総発注数: ${analysisData.summary.totalOrders}`)
      console.log(`   総損益: $${analysisData.summary.totalPnL.toFixed(2)}`)
      console.log(`   勝率: ${analysisData.summary.winRate.toFixed(1)}%`)

      if (Object.keys(analysisData.byTag).length > 0) {
        console.log('\n   タグ別分析:')
        Object.entries(analysisData.byTag).forEach(([tag, data]: [string, any]) => {
          console.log(`     ${tag}: ${data.count}件, $${data.totalPnL.toFixed(2)}`)
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorData = (error as any).response?.data
      console.error('❌ 分析データエラー:', errorData || errorMessage)
    }

    // 4. 取引履歴テスト
    console.log('\n📋 取引履歴テスト...')
    try {
      const historyResponse = await axios.get(`${API_BASE}/history?limit=5`)
      const historyData = historyResponse.data.data

      console.log('✅ 取引履歴取得成功')
      console.log(`   取得件数: ${historyData.count}`)

      if (historyData.orders.length > 0) {
        console.log('\n--- 取引履歴 (最新5件) ---')
        historyData.orders.forEach((order: any, index: number) => {
          console.log(`${index + 1}. orderID: ${order.orderID}`)
          console.log(`   ${order.symbol} ${order.buySell} ${order.totalQuantity}`)
          console.log(`   平均価格: $${order.avgPrice.toFixed(2)}`)
          console.log(`   状態: ${order.positionStatus}`)
          console.log(`   タグ: ${order.tag || 'なし'}`)
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorData = (error as any).response?.data
      console.error('❌ 取引履歴エラー:', errorData || errorMessage)
    }

    // 5. バンドル一覧テスト
    console.log('\n📦 バンドル一覧テスト...')
    try {
      const bundlesResponse = await axios.get(`${API_BASE}/bundles`)
      const bundlesData = bundlesResponse.data.data

      console.log('✅ バンドル一覧取得成功')
      console.log(`   バンドル数: ${bundlesData.length}`)

      if (bundlesData.length > 0) {
        console.log('\n--- バンドル一覧 ---')
        bundlesData.forEach((bundle: any, index: number) => {
          console.log(`${index + 1}. ${bundle.name || bundle._id}`)
          console.log(`   銘柄: ${bundle.symbol} 満期: ${bundle.expiry}`)
          console.log(`   発注数: ${bundle.orderCount}`)
          console.log(`   総損益: $${bundle.totalPnL.toFixed(2)}`)
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorData = (error as any).response?.data
      console.error('❌ バンドル一覧エラー:', errorData || errorMessage)
    }

    console.log('\n=== API機能テスト（模擬操作） ===')

    // 6. タグ付けテスト（実際には実行しない）
    console.log('\n🏷️  タグ付け機能テスト準備...')
    const samplePositionKey = 'VIX_20_250917_PUT'
    console.log(`   サンプルポジションキー: ${samplePositionKey}`)
    console.log('   実際のタグ付けはフロントエンドからテストしてください')

    // 7. バンドル作成テスト（実際には実行しない）
    console.log('\n📦 バンドル作成機能テスト準備...')
    console.log('   複数のポジションを選択してバンドル作成をテストしてください')

    console.log('\n✅ API インテグレーションテスト完了')
    console.log('\n📝 次のステップ:')
    console.log('1. フロントエンドからタグ付け機能をテスト')
    console.log('2. フロントエンドからバンドル作成機能をテスト')
    console.log('3. エラーハンドリングのテスト')
  } catch (error) {
    console.error('❌ テスト実行エラー:', error)
  } finally {
    process.exit(0)
  }
}

// エラー状況のテスト
async function testErrorCases() {
  console.log('\n=== エラーケーステスト ===')

  // 1. 不正なバンドル作成
  console.log('\n❌ 不正なバンドル作成テスト...')
  try {
    await axios.post(`${API_BASE}/bundles`, {
      name: '',
      positionKeys: [],
    })
  } catch (error) {
    const errorData = (error as any).response?.data
    console.log('✅ 期待通りエラー:', errorData?.message || 'エラーレスポンス')
  }

  // 2. 不正なタグ付け
  console.log('\n❌ 不正なタグ付けテスト...')
  try {
    await axios.post(`${API_BASE}/tag-position`, {
      positionKey: '',
      tag: 'INVALID',
    })
  } catch (error) {
    const errorData = (error as any).response?.data
    console.log('✅ 期待通りエラー:', errorData?.message || 'エラーレスポンス')
  }
}

// 実行
console.log('Interactive Brokers API インテグレーションテスト')
console.log('サーバーが http://localhost:3001 で起動している必要があります')
console.log('Ctrl+C で終了\n')

testAPIIntegration()
  .then(() => testErrorCases())
  .catch((error) => {
    console.error('テスト失敗:', error)
    process.exit(1)
  })
