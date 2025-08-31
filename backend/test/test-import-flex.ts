// backend/test/test-import-flex.ts
import { TradeDataService } from '../services/ib-service/TradeDataService'
import { connectToDatabase } from '../database/connection'
import { TradeExecution } from '../models/TradeExecution'
import * as dotenv from 'dotenv'

dotenv.config()

async function testImportFlexExecutions() {
  console.log('=== Flex Query インポート機能テスト ===')

  try {
    // データベース接続
    await connectToDatabase()
    console.log('MongoDB接続成功')

    // 環境変数確認
    if (!process.env.IB_FLEX_TOKEN || !process.env.IB_FLEX_QUERY_ID) {
      console.error('❌ 環境変数が設定されていません')
      console.log('必要な環境変数:')
      console.log('IB_FLEX_TOKEN=your-token')
      console.log('IB_FLEX_QUERY_ID=your-query-id')
      return
    }

    console.log(`Token: ${process.env.IB_FLEX_TOKEN.substring(0, 8)}...`)
    console.log(`Query ID: ${process.env.IB_FLEX_QUERY_ID}`)

    // インポート前のデータ数を確認
    const beforeCount = await TradeExecution.countDocuments()
    console.log(`\nインポート前のレコード数: ${beforeCount}件`)

    // サービスのインスタンス化
    const tradeDataService = new TradeDataService()

    // インポート実行
    console.log('\n📊 Flex Query データインポート開始...')
    const startTime = Date.now()

    const result = await tradeDataService.importFlexExecutions(30)

    const endTime = Date.now()
    const duration = ((endTime - startTime) / 1000).toFixed(2)

    console.log(`\n✅ インポート完了 (${duration}秒)`)
    console.log(`新規インポート: ${result.imported}件`)
    console.log(`スキップ: ${result.skipped}件`)

    // インポート後のデータ数を確認
    const afterCount = await TradeExecution.countDocuments()
    console.log(`インポート後のレコード数: ${afterCount}件`)

    // データの内容確認
    console.log('\n--- インポートされたデータのサンプル ---')
    const sampleData = await TradeExecution.find().sort({ tradeDate: -1 }).limit(5)

    sampleData.forEach((execution, index) => {
      console.log(`${index + 1}. ${execution.symbol} (${execution.secType})`)
      console.log(`   日時: ${execution.tradeDate.toISOString().slice(0, 10)} ${execution.tradeTime || ''}`)
      console.log(`   売買: ${execution.buySell} ${execution.quantity}株 @ $${execution.price}`)
      console.log(`   execID: ${execution.execID}`)
      console.log(`   データソース: ${execution.dataSource}`)

      if (execution.secType === 'OPT') {
        console.log(`   オプション: ${execution.putCall} Strike ${execution.strike} Exp ${execution.expiry}`)
      }

      if (execution.realizedPnL) {
        console.log(`   実現損益: $${execution.realizedPnL}`)
      }

      console.log('')
    })

    // 統計情報
    console.log('--- 統計情報 ---')
    const stats = await TradeExecution.aggregate([
      {
        $group: {
          _id: null,
          totalTrades: { $sum: 1 },
          totalPnL: { $sum: { $ifNull: ['$realizedPnL', 0] } },
          totalCommission: { $sum: { $abs: '$ibCommission' } },
          openTrades: {
            $sum: { $cond: [{ $eq: ['$positionStatus', 'OPEN'] }, 1, 0] },
          },
          closedTrades: {
            $sum: { $cond: [{ $eq: ['$positionStatus', 'CLOSED'] }, 1, 0] },
          },
        },
      },
    ])

    if (stats.length > 0) {
      const stat = stats[0]
      console.log(`総取引数: ${stat.totalTrades}`)
      console.log(`総実現損益: $${stat.totalPnL.toFixed(2)}`)
      console.log(`総手数料: $${stat.totalCommission.toFixed(2)}`)
      console.log(`オープン取引: ${stat.openTrades}件`)
      console.log(`クローズ済み: ${stat.closedTrades}件`)
    }

    // 銘柄別統計
    console.log('\n--- 銘柄別統計 ---')
    const symbolStats = await TradeExecution.aggregate([
      {
        $group: {
          _id: '$symbol',
          count: { $sum: 1 },
          totalPnL: { $sum: { $ifNull: ['$realizedPnL', 0] } },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ])

    symbolStats.forEach((stat) => {
      console.log(`${stat._id}: ${stat.count}件, 損益: $${stat.totalPnL.toFixed(2)}`)
    })

    // 証券タイプ別統計
    console.log('\n--- 証券タイプ別統計 ---')
    const secTypeStats = await TradeExecution.aggregate([
      {
        $group: {
          _id: '$secType',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ])

    secTypeStats.forEach((stat) => {
      const typeName =
        stat._id === 'OPT' ? 'オプション' : stat._id === 'FUT' ? '先物' : stat._id === 'STK' ? '株式' : stat._id
      console.log(`${typeName}: ${stat.count}件`)
    })

    console.log('\n✅ テスト完了')
  } catch (error) {
    console.error('❌ テスト失敗:', error)

    if (error instanceof Error) {
      if (error.message.includes('Invalid token')) {
        console.log('\n💡 Flex Query トークンが無効です')
      } else if (error.message.includes('Query not found')) {
        console.log('\n💡 Flex Query IDが見つかりません')
      } else if (error.message.includes('ECONNREFUSED')) {
        console.log('\n💡 MongoDBに接続できません。起動しているか確認してください')
      }
    }

    process.exit(1)
  }
}

// エラーテストも実行
async function testErrorHandling() {
  console.log('\n=== エラーハンドリングテスト ===')

  try {
    // 不正なトークンでテスト
    process.env.IB_FLEX_TOKEN = 'invalid-token'
    const tradeDataService = new TradeDataService()

    await tradeDataService.importFlexExecutions()
    console.log('❌ エラーが発生するはずでした')
  } catch (error) {
    console.log('✅ 不正なトークンでエラーを正しくキャッチしました')
    console.log(`エラー: ${error instanceof Error ? error.message : error}`)
  }
}

// 実行
console.log('Interactive Brokers Flex Query インポートテスト')
console.log('Ctrl+C で終了\n')

testImportFlexExecutions()
  .then(() => {
    console.log('\n=== メインテスト完了 ===')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ テスト実行エラー:', error)
    process.exit(1)
  })
