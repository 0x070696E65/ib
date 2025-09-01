// backend/test/test-aggregated-import.ts
import { AggregatedTradeService } from '../services/ib-service/AggregatedTradeService'
import { connectToDatabase } from '../database/connection'
import { TradeOrder } from '../models/TradeOrder'
import * as dotenv from 'dotenv'

dotenv.config()

async function testAggregatedImport() {
  console.log('=== orderID単位集約インポートテスト ===')

  try {
    await connectToDatabase()
    console.log('MongoDB接続成功')

    const beforeCount = await TradeOrder.countDocuments()
    console.log(`インポート前の発注レコード数: ${beforeCount}件`)

    const aggregatedService = new AggregatedTradeService()

    console.log('orderID単位での集約インポート開始...')
    const startTime = Date.now()

    const result = await aggregatedService.importAndAggregateFlexExecutions()

    const endTime = Date.now()
    const duration = ((endTime - startTime) / 1000).toFixed(2)

    console.log(`集約インポート完了 (${duration}秒)`)
    console.log(`新規インポート: ${result.imported}件の発注`)
    console.log(`スキップ: ${result.skipped}件の発注`)

    const afterCount = await TradeOrder.countDocuments()
    console.log(`インポート後の発注レコード数: ${afterCount}件`)

    // 集約結果の確認
    console.log('\n--- 集約された発注データ (最新5件) ---')
    const sampleOrders = await TradeOrder.find().sort({ tradeDate: -1 }).limit(5)

    sampleOrders.forEach((order, index) => {
      console.log(`${index + 1}. orderID: ${order.orderID}`)
      console.log(`   ${order.symbol} (${order.secType})`)
      console.log(`   日時: ${order.tradeDate.toISOString().slice(0, 10)} ${order.firstExecutionTime}`)
      console.log(`   売買: ${order.buySell} ${order.totalQuantity}株`)
      console.log(`   平均価格: $${order.avgPrice.toFixed(2)}`)
      console.log(`   総額: $${order.totalAmount.toFixed(2)}`)
      console.log(`   手数料: $${order.totalCommission.toFixed(2)}`)

      if (order.secType === 'OPT') {
        console.log(`   オプション: ${order.putCall} Strike ${order.strike} Exp ${order.expiry}`)
      }

      if (order.totalRealizedPnL) {
        console.log(`   実現損益: $${order.totalRealizedPnL.toFixed(2)}`)
      }

      console.log(`   約定数: ${order.execIDs.length}件`)
      console.log(`   約定詳細:`)
      order.executionDetails.forEach((detail) => {
        console.log(`     ${detail.time} | ${detail.quantity}株 @ $${detail.price} (手数料: $${detail.commission})`)
      })

      console.log('')
    })

    // 集約統計
    console.log('--- 集約統計情報 ---')
    const stats = await TradeOrder.aggregate([
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalExecutions: { $sum: { $size: '$execIDs' } },
          totalPnL: { $sum: { $ifNull: ['$totalRealizedPnL', 0] } },
          totalCommission: { $sum: '$totalCommission' },
          openOrders: {
            $sum: { $cond: [{ $eq: ['$positionStatus', 'OPEN'] }, 1, 0] },
          },
          closedOrders: {
            $sum: { $cond: [{ $eq: ['$positionStatus', 'CLOSED'] }, 1, 0] },
          },
        },
      },
    ])

    if (stats.length > 0) {
      const stat = stats[0]
      console.log(`総発注数: ${stat.totalOrders}`)
      console.log(`総約定数: ${stat.totalExecutions}`)
      console.log(`約定/発注比率: ${(stat.totalExecutions / stat.totalOrders).toFixed(2)}`)
      console.log(`総実現損益: $${stat.totalPnL.toFixed(2)}`)
      console.log(`総手数料: $${stat.totalCommission.toFixed(2)}`)
      console.log(`オープン発注: ${stat.openOrders}件`)
      console.log(`クローズ済み: ${stat.closedOrders}件`)
    }

    // 複数約定に分割された発注を特定
    console.log('\n--- 複数約定に分割された発注 ---')
    const splitOrders = await TradeOrder.find({
      'executionDetails.1': { $exists: true }, // 2つ以上の約定を持つ発注
    })
      .sort({ executionDetails: -1 })
      .limit(10)

    splitOrders.forEach((order) => {
      console.log(`orderID ${order.orderID}: ${order.executionDetails.length}件の約定に分割`)
      console.log(`  ${order.symbol} ${order.buySell} ${order.totalQuantity}株 @ 平均$${order.avgPrice.toFixed(2)}`)
      console.log(`  約定詳細:`)
      order.executionDetails.forEach((detail) => {
        console.log(`    ${detail.quantity}株 @ $${detail.price}`)
      })
      console.log('')
    })

    console.log('テスト完了')
  } catch (error) {
    console.error('テスト失敗:', error)
    process.exit(1)
  }
}

// 実行
console.log('Interactive Brokers 集約インポートテスト')
console.log('Ctrl+C で終了\n')

testAggregatedImport()
  .then(() => {
    console.log('集約テスト完了')
    process.exit(0)
  })
  .catch((error) => {
    console.error('集約テスト実行エラー:', error)
    process.exit(1)
  })
