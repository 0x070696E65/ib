// test-flex-query.ts - Flex Query API テスト
import { createFlexQueryService } from '../services/ib-service/FlexQueryService'
import * as dotenv from 'dotenv'

dotenv.config()

async function testFlexQuery() {
  console.log('=== Flex Query API テスト開始 ===')

  // 環境変数チェック
  const token = process.env.IB_FLEX_TOKEN
  const queryId = process.env.IB_FLEX_QUERY_ID

  if (!token || !queryId) {
    console.error('❌ 環境変数が設定されていません')
    console.log('必要な設定:')
    console.log('IB_FLEX_TOKEN=your-token-here')
    console.log('IB_FLEX_QUERY_ID=your-query-id-here')
    console.log('')
    console.log('.envファイルを作成するか、以下のように直接設定してください:')
    console.log('export IB_FLEX_TOKEN="your-token"')
    console.log('export IB_FLEX_QUERY_ID="your-query-id"')
    return
  }

  console.log('✅ 環境変数確認完了')
  console.log(`Token: ${token.substring(0, 8)}...`)
  console.log(`Query ID: ${queryId}`)
  console.log('')

  try {
    const flexService = createFlexQueryService(token, queryId)

    console.log('📊 過去30日の約定履歴を取得中...')
    console.log('※ 初回は2-3分かかる場合があります')
    console.log('')

    const executions = await flexService.getExecutionHistory(30)

    if (executions.length === 0) {
      console.log('📝 過去30日間の約定履歴はありませんでした')
      console.log('💡 期間を延ばして再テストしてみます...')

      const longExecutions = await flexService.getExecutionHistory(90)
      console.log(`📊 過去90日: ${longExecutions.length}件`)

      if (longExecutions.length > 0) {
        displayExecutions(flexService, longExecutions.slice(0, 10))
      }
    } else {
      console.log(`✅ 約定履歴取得成功: ${executions.length}件`)
      console.log('')

      // 最新10件を表示
      displayExecutions(flexService, executions.slice(0, 10))

      // 統計情報
      const stats = flexService.calculateStats(executions)
      displayStats(stats)

      // VIXオプションがあるかチェック
      const vixOptions = flexService.filterVixOptions(executions)
      if (vixOptions.length > 0) {
        console.log(`\n🎯 VIXオプション約定: ${vixOptions.length}件`)
        console.log('最新のVIXオプション約定:')
        vixOptions.slice(0, 5).forEach((exec, i) => {
          const side = exec.buySell === 'BUY' ? '買い' : '売り'
          console.log(`  ${i + 1}. ${exec.tradeDate} | ${side} | ${exec.quantity}株 @ $${exec.price}`)
          if (exec.strike && exec.putCall) {
            console.log(`     ${exec.putCall} Strike: ${exec.strike} Exp: ${exec.expiry}`)
          }
        })
      }
    }
  } catch (error) {
    console.error('❌ Flex Query エラー:', error)

    if (error instanceof Error) {
      if (error.message.includes('Invalid token')) {
        console.log('\n💡 トークンが無効です。Client Portalで新しいトークンを生成してください。')
      } else if (error.message.includes('Query not found')) {
        console.log('\n💡 Query IDが見つかりません。Flex Queryの設定を確認してください。')
      } else if (error.message.includes('timeout')) {
        console.log('\n💡 レポート生成がタイムアウトしました。しばらく待ってから再実行してください。')
      }
    }
  }
}

function displayExecutions(flexService: any, executions: any[]) {
  console.log('--- 約定履歴 (最新順) ---')

  const sorted = flexService.sortByDate(executions, false)

  sorted.forEach(
    (
      exec: {
        symbol: any
        secType: string
        tradeDate: any
        tradeTime: any
        buySell: string
        quantity: any
        price: number
        ibCommission: number
        netCash: number
        putCall: any
        strike: any
        expiry: any
        fifoPnlRealized: number
        exchange: any
        execID: any
      },
      index: number
    ) => {
      console.log(`${index + 1}. ${exec.symbol} (${exec.secType})`)
      console.log(`   日時: ${exec.tradeDate} ${exec.tradeTime}`)
      console.log(`   売買: ${exec.buySell === 'BUY' ? '買い' : '売り'}`)
      console.log(`   数量: ${exec.quantity}`)
      console.log(`   価格: $${exec.price.toFixed(2)}`)
      console.log(`   手数料: $${Math.abs(exec.ibCommission).toFixed(2)}`)
      console.log(`   純額: $${exec.netCash.toFixed(2)}`)

      if (exec.secType === 'OPT') {
        console.log(`   オプション: ${exec.putCall} Strike ${exec.strike} Exp ${exec.expiry}`)
      }

      if (exec.fifoPnlRealized) {
        console.log(`   実現損益: $${exec.fifoPnlRealized.toFixed(2)}`)
      }

      console.log(`   取引所: ${exec.exchange}`)
      console.log(`   執行ID: ${exec.execID}`)
      console.log('')
    }
  )
}

function displayStats(stats: any) {
  console.log('\n--- 約定統計 ---')
  console.log(`総約定数: ${stats.totalTrades}件`)
  console.log(`買い: ${stats.buyTrades}件 / 売り: ${stats.sellTrades}件`)
  console.log(`総手数料: $${stats.totalCommission.toFixed(2)}`)

  if (stats.totalPnL !== 0) {
    console.log(`実現損益: $${stats.totalPnL.toFixed(2)}`)
  }

  console.log('\n銘柄別:')
  Object.entries(stats.bySymbol)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 5)
    .forEach(([symbol, count]) => {
      console.log(`  ${symbol}: ${count}件`)
    })

  console.log('\n証券タイプ別:')
  Object.entries(stats.bySecType).forEach(([secType, count]) => {
    const typeName =
      secType === 'OPT' ? 'オプション' : secType === 'FUT' ? '先物' : secType === 'STK' ? '株式' : secType
    console.log(`  ${typeName}: ${count}件`)
  })
}

// 実行
console.log('Interactive Brokers Flex Query API テスト')
console.log('Ctrl+C で終了\n')

testFlexQuery()
  .then(() => {
    console.log('\n✅ Flex Query テスト完了')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Flex Query テスト失敗:', error)
    process.exit(1)
  })
