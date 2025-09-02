// backend/test/test-option-prices.ts - オプション価格取得テスト（修正版）
import { createIbServices } from '../services/ib-service'
import { VixExpirationModel } from '../models/VixExpiration'
import { connectToDatabase } from '../database/connection'
import * as dotenv from 'dotenv'

dotenv.config()

async function testOptionPrices() {
  const { optionPrice, ib } = createIbServices()

  console.log('=== オプション価格取得テスト開始 ===')

  try {
    await connectToDatabase()
    console.log('MongoDB接続成功')

    // 1. 利用可能な満期日を取得
    console.log('\n--- 満期日取得テスト ---')
    const expirations = await VixExpirationModel.find({}).sort({ expiration: 1 })
    console.log(`満期日数: ${expirations.length}件`)

    if (expirations.length === 0) {
      console.log('満期日が見つかりません。VixExpirationコレクションを確認してください。')
      return
    }

    expirations.forEach((exp, index) => {
      console.log(`${index + 1}. ${exp.expiration} (${formatExpiration(exp.expiration)})`)
    })

    // 2. 単一オプション価格取得テスト
    const testExpiration = expirations[0].expiration
    const testStrike = 25

    console.log(`\n--- 単一価格取得テスト ---`)
    console.log(`満期: ${testExpiration}, ストライク: ${testStrike}`)

    let singlePrice
    try {
      singlePrice = await optionPrice.getSingleOptionPrice(testExpiration, testStrike)
      console.log('✅ 単一価格取得成功:')
      console.log(`   Bid: ${singlePrice.bid}`)
      console.log(`   Ask: ${singlePrice.ask}`)
      console.log(`   Mid: ${singlePrice.midPrice}`)
      console.log(`   Last: ${singlePrice.lastPrice}`)
      if (singlePrice.volume !== undefined) {
        console.log(`   Volume: ${singlePrice.volume}`)
      }
    } catch (singleError) {
      console.error('❌ 単一価格取得エラー:', singleError)
      return
    }

    // 3. 範囲指定価格取得テスト
    console.log(`\n--- 範囲価格取得テスト ---`)
    const strikeMin = 23
    const strikeMax = 27
    console.log(`満期: ${testExpiration}, ストライク: ${strikeMin}-${strikeMax}`)

    try {
      const rangePrices = await optionPrice.getOptionPrices({
        expiration: testExpiration,
        strikeMin,
        strikeMax,
        stepSize: 1,
      })

      console.log(`✅ 範囲価格取得成功: ${rangePrices.length}件`)

      rangePrices.forEach((price, index) => {
        console.log(`${index + 1}. Strike ${price.strike}: Bid=${price.bid}, Ask=${price.ask}, Mid=${price.midPrice}`)
      })

      // 統計情報
      const validPrices = rangePrices.filter((p) => p.bid > 0 && p.ask > 0)
      console.log(`\n📊 統計情報:`)
      console.log(`   有効価格数: ${validPrices.length}/${rangePrices.length}`)

      if (validPrices.length > 0) {
        const avgSpread = validPrices.reduce((sum, p) => sum + (p.ask - p.bid), 0) / validPrices.length
        console.log(`   平均スプレッド: ${avgSpread.toFixed(4)}`)
        console.log(
          `   平均Mid価格: ${(validPrices.reduce((sum, p) => sum + p.midPrice, 0) / validPrices.length).toFixed(4)}`
        )
      }
    } catch (rangeError) {
      console.error('❌ 範囲価格取得エラー:', rangeError)
    }

    // 4. 損益計算テスト（実際の取得価格を使用）
    console.log(`\n--- 損益計算テスト ---`)
    const testPremium = singlePrice.midPrice // 実際の取得価格を使用
    const testQuantity = -100 // 売り
    console.log(`Strike: ${testStrike}, Premium: ${testPremium.toFixed(2)}, Quantity: ${testQuantity}`)

    const scenarios: Array<{ futurePrice: number; profit: number }> = []
    for (let futurePrice = 18; futurePrice <= 32; futurePrice++) {
      let profit: number
      if (testQuantity > 0) {
        // PUT買い
        if (futurePrice >= testStrike) {
          profit = -testPremium * testQuantity
        } else {
          profit = -testPremium * testQuantity + (testStrike - futurePrice) * testQuantity
        }
      } else {
        // PUT売り
        const absQuantity = Math.abs(testQuantity)
        if (futurePrice >= testStrike) {
          profit = testPremium * absQuantity
        } else {
          profit = testPremium * absQuantity - (testStrike - futurePrice) * absQuantity
        }
      }
      scenarios.push({ futurePrice, profit })
    }

    console.log('損益シナリオ:')
    scenarios.forEach((scenario) => {
      const profitStr = scenario.profit >= 0 ? `+${scenario.profit.toFixed(0)}` : `${scenario.profit.toFixed(0)}`
      console.log(`   先物価格 ${scenario.futurePrice} → 損益 ${profitStr}`)
    })

    // 損益分岐点と重要指標
    const breakEvenPoint = testStrike - testPremium
    const maxProfit = testPremium * Math.abs(testQuantity)
    console.log(`\n💡 分析結果:`)
    console.log(`   理論損益分岐点: ${breakEvenPoint.toFixed(2)}`)
    console.log(`   最大利益: ${maxProfit.toFixed(0)} (先物価格 ≥ ${testStrike})`)
    console.log(`   最大損失: 無制限 (先物価格 → 0)`)

    // 接続状況表示
    const connectionInfo = ib.getConnectionInfo()
    console.log('\n--- 接続情報 ---')
    console.log(`ホスト: ${connectionInfo.host}:${connectionInfo.port}`)
    console.log(`クライアントID: ${connectionInfo.clientId}`)
    console.log(`接続状態: ${connectionInfo.connected ? '✅ 接続中' : '❌ 未接続'}`)
    console.log(`ペンディングリクエスト: ${connectionInfo.pendingRequests}`)
  } catch (error) {
    console.error('❌ テスト実行エラー:', error)

    if (error instanceof Error) {
      if (error.message.includes('接続') || error.message.includes('connect')) {
        console.log('\n💡 確認事項:')
        console.log('1. TWS または IB Gateway が起動しているか')
        console.log('2. API接続が有効になっているか（TWS設定 > API > Enable ActiveX and Socket Clients）')
        console.log('3. ポート番号が正しいか（TWS: 7497, IB Gateway: 4001/4002）')
        console.log('4. マーケットデータの購読権限があるか')
      } else if (error.message.includes('タイムアウト')) {
        console.log('\n💡 タイムアウト原因:')
        console.log('1. 市場時間外の可能性')
        console.log('2. 該当ストライクのオプションが存在しない')
        console.log('3. マーケットデータフィードの問題')
      }
    }
  } finally {
    // マーケットデータ購読をキャンセル
    try {
      optionPrice.cancelAllSubscriptions()
      console.log('\n📡 マーケットデータ購読をキャンセルしました')
    } catch (cancelError) {
      console.warn('購読キャンセルエラー:', cancelError)
    }

    // 接続クリーンアップ
    try {
      await ib.cleanup()
      console.log('🧹 接続をクリーンアップしました')
    } catch (cleanupError) {
      console.warn('クリーンアップエラー:', cleanupError)
    }
  }
}

// ユーティリティ関数
function formatExpiration(expiration: string): string {
  return `${expiration.slice(0, 4)}-${expiration.slice(4, 6)}-${expiration.slice(6, 8)}`
}

// 実行
console.log('Interactive Brokers オプション価格取得テスト')
console.log('Ctrl+C で終了\n')

testOptionPrices()
  .then(() => {
    console.log('\n✅ テスト完了')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ テスト失敗:', error)
    process.exit(1)
  })
