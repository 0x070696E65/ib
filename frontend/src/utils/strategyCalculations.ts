// frontend/src/utils/strategyCalculations.ts
import type { OptionPrice } from '../types/options'
import type { FuturePrice } from '../types/futures'

export interface StrategyPair {
  id: string
  expiration: string
  sellStrike: number // ヘッジ（先物価格近辺）
  buyStrike: number // メイン利益（売りより高い）
  sellPrice: number
  buyPrice: number
  netDebit: number // 買い価格 - 売り価格（支払う金額）
  futurePrice: number // 戦略判断の基準となる先物価格
  quantity: number
  metrics: StrategyMetrics
}

export interface StrategyMetrics {
  maxProfit: number // 買いストライクでの最大利益
  maxLoss: number // ネットデビット（最大損失）
  profitLossRatio: number // 最大利益 / 最大損失
  breakEvenPoint: number // 損益分岐点
  winRate: number // VIX下落前提での勝率推定
  riskAdjustedReturn: number
}

export const generateOptionPairs = (
  multiData: { expirations: string[]; results: Record<string, OptionPrice[]> },
  futurePrices: Record<string, FuturePrice>
): StrategyPair[] => {
  const pairs: StrategyPair[] = []
  let debugLog = ''

  // 各限月ごとに処理
  multiData.expirations.forEach((expiration) => {
    const prices = multiData.results[expiration] || []
    const futurePrice = futurePrices[expiration]

    if (!futurePrice) {
      debugLog += `⚠ ${expiration}: 先物価格なし - スキップ\n`
      return
    }

    debugLog += `\n=== Processing ${expiration} (先物価格: ${futurePrice.midPrice.toFixed(2)}) ===\n`

    const sortedPrices = prices.sort((a, b) => a.strike - b.strike)
    let pairCount = 0
    const skipReasons: Record<string, number> = {}

    // 売り候補: 先物価格 ± 1 の範囲
    const futureMid = futurePrice.midPrice
    const sellCandidates = sortedPrices.filter((p) => Math.abs(p.strike - futureMid) <= 1 && p.midPrice > 0)

    // 買い候補: 売りストライクより高い全てのストライク
    for (const sellOption of sellCandidates) {
      const buyCandidates = sortedPrices.filter((p) => p.strike > sellOption.strike && p.midPrice > 0)

      for (const buyOption of buyCandidates) {
        // ネットデビット計算（支払う金額）
        const netDebit = buyOption.midPrice - sellOption.midPrice

        if (netDebit <= 0) {
          skipReasons['negative_debit'] = (skipReasons['negative_debit'] || 0) + 1
          continue // デビット戦略でないとおかしい
        }

        // 戦略メトリクス計算
        const metrics = calculateStrategyMetrics(sellOption, buyOption, netDebit, futureMid)

        // フィルタリング条件
        if (metrics.maxLoss > 3000) {
          // ネットデビット制限
          skipReasons['max_loss'] = (skipReasons['max_loss'] || 0) + 1
          continue
        }

        if (metrics.profitLossRatio < 0.3) {
          // 最低利益率
          skipReasons['profit_ratio'] = (skipReasons['profit_ratio'] || 0) + 1
          continue
        }

        if (buyOption.strike - sellOption.strike > 8) {
          // ストライク差制限
          skipReasons['strike_diff'] = (skipReasons['strike_diff'] || 0) + 1
          continue
        }

        const pair: StrategyPair = {
          id: `${expiration}_${sellOption.strike}_${buyOption.strike}`,
          expiration,
          sellStrike: sellOption.strike,
          buyStrike: buyOption.strike,
          sellPrice: sellOption.midPrice,
          buyPrice: buyOption.midPrice,
          netDebit,
          futurePrice: futureMid,
          quantity: 100,
          metrics,
        }

        pairs.push(pair)
        pairCount++

        if (pairCount <= 3) {
          debugLog += `  ✓ SELL ${sellOption.strike}P(${sellOption.midPrice.toFixed(2)}) / BUY ${
            buyOption.strike
          }P(${buyOption.midPrice.toFixed(2)}) = デビット${netDebit.toFixed(2)} / 最大利益${metrics.maxProfit.toFixed(
            0
          )}\n`
        }
      }
    }

    debugLog += `Result: ${pairCount} pairs generated (sell candidates: ${sellCandidates.length})\n`
    Object.entries(skipReasons).forEach(([reason, count]) => {
      debugLog += `  Skipped ${count} pairs due to: ${reason}\n`
    })
  })

  console.log('Strategy Generation Debug:', debugLog)

  return pairs.sort((a, b) => b.metrics.riskAdjustedReturn - a.metrics.riskAdjustedReturn).slice(0, 50)
}

const calculateStrategyMetrics = (
  sellOption: OptionPrice, // ヘッジポジション
  buyOption: OptionPrice, // メインポジション
  netDebit: number, // 支払った金額
  futurePrice: number // 先物価格
): StrategyMetrics => {
  const quantity = 100
  const sellStrike = sellOption.strike
  const buyStrike = buyOption.strike

  // 最大利益: (買いストライク - 売りストライク - ネットデビット) × 数量
  // VIXが0まで下がった場合の利益
  const maxProfit = (buyStrike - sellStrike - netDebit) * quantity

  // 最大損失: ネットデビット × 数量
  // VIXが買いストライクを上回った場合の損失
  const maxLoss = netDebit * quantity

  // 損益比率
  const profitLossRatio = maxLoss > 0 ? maxProfit / maxLoss : 0

  // 損益分岐点: 買いストライク - ネットデビット
  const breakEvenPoint = buyStrike - netDebit

  // 勝率推定（VIX下落前提）
  const winRate = calculateWinRate(futurePrice, breakEvenPoint)

  // リスク調整後リターン
  const expectedReturn = maxProfit * winRate - maxLoss * (1 - winRate)
  const riskAdjustedReturn = maxLoss > 0 ? expectedReturn / maxLoss : 0

  return {
    maxProfit,
    maxLoss,
    profitLossRatio,
    breakEvenPoint,
    winRate,
    riskAdjustedReturn,
  }
}

// 線形モデルによる勝率計算
const calculateWinRate = (futurePrice: number, breakEven: number): number => {
  if (futurePrice <= breakEven) {
    return 0.2 // 既にブレイクイーブン以下なら低い勝率
  }

  const priceDiff = futurePrice - breakEven
  const volatilityFactor = 0.3 // VIXボラティリティ30%想定

  const winRate = Math.min(0.9, 0.5 + priceDiff / (futurePrice * volatilityFactor))

  return Math.max(0.1, winRate)
}
