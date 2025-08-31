// test-pnl-single.ts
// 実行方法: npx ts-node test-pnl-single.ts

import { createIbServices } from '../services/ib-service'
import { EventName } from '@stoqey/ib'

async function testPnLSingle() {
  const { ib } = createIbServices()

  console.log('=== PnLSingle直接テスト開始 ===')

  try {
    // IB接続
    console.log('IBに接続中...')
    await ib.connect()
    console.log('IB接続完了')

    // まずポジションを取得
    console.log('ポジション取得中...')
    const positions: any[] = []
    let positionsComplete = false

    ib.getIbApi().on(EventName.position as any, (account: string, contract: any, position: number, avgCost: number) => {
      if (position !== 0) {
        positions.push({ account, contract, position, avgCost })
        console.log(`ポジション発見: ${contract.symbol} ${contract.conId} (${position}@${avgCost})`)
      }
    })

    ib.getIbApi().on(EventName.positionEnd, () => {
      console.log('ポジション取得完了')
      positionsComplete = true
    })

    // ポジション要求
    ib.getIbApi().reqPositions()

    // ポジション取得完了を待つ
    while (!positionsComplete) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    if (positions.length === 0) {
      console.log('ポジションが見つかりません')
      return
    }

    // 最初のポジションでPnLSingleをテスト
    const testPosition = positions[0]
    console.log(`\n=== PnLSingleテスト対象 ===`)
    console.log(`Account: ${testPosition.account}`)
    console.log(`Contract ID: ${testPosition.contract.conId}`)
    console.log(`Symbol: ${testPosition.contract.symbol}`)

    // PnLSingleイベントリスナー
    ib.getIbApi().on(
      EventName.pnlSingle as any,
      (reqId: number, pos: number, dailyPnL: number, unrealizedPnL: number, realizedPnL: number, value: number) => {
        console.log(`\n✅ PnLSingle成功！`)
        console.log(`ReqId: ${reqId}`)
        console.log(`Position: ${pos}`)
        console.log(`Daily PnL: ${dailyPnL}`)
        console.log(`Unrealized PnL: ${unrealizedPnL}`)
        console.log(`Realized PnL: ${realizedPnL}`)
        console.log(`Value: ${value}`)
      }
    )

    // エラーハンドリング
    ib.getIbApi().on(EventName.error, (error: Error, code: number, reqId?: number) => {
      if (reqId && reqId >= 9001 && reqId <= 9002) {
        console.log(`\n❌ PnLSingle エラー (ReqId: ${reqId})`)
        console.log(`Code: ${code}`)
        console.log(`Error: ${error.message}`)
      }
    })

    // Pattern 1: 空文字
    console.log(`\n--- Pattern 1: 空文字 ---`)
    console.log(`reqPnLSingle(9001, "${testPosition.account}", "", ${testPosition.contract.conId})`)
    ib.getIbApi().reqPnLSingle(9001, testPosition.account, '', testPosition.contract.conId)

    // 3秒待つ
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // Pattern 2: アカウント名
    console.log(`\n--- Pattern 2: アカウント名 ---`)
    console.log(
      `reqPnLSingle(9002, "${testPosition.account}", "${testPosition.account}", ${testPosition.contract.conId})`
    )
    ib.getIbApi().reqPnLSingle(9002, testPosition.account, testPosition.account, testPosition.contract.conId)

    // 3秒待つ
    await new Promise((resolve) => setTimeout(resolve, 3000))

    console.log('\n=== テスト完了 ===')
  } catch (error) {
    console.error('テストエラー:', error)
  } finally {
    // 切断
    await ib.disconnect()
    process.exit(0)
  }
}

// 実行
testPnLSingle().catch(console.error)
