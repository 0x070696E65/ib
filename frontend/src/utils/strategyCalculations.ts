// frontend/src/utils/strategyCalculations.ts
import type { OptionPrice } from '../types/options'
import type { FuturePrice } from '../types/futures'

export interface StrategyPair {
  id: string
  expiration: string
  daysToExpiration: number // 満期までの日数
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

  // 4ヶ月ローリング戦略用指標
  capitalEfficiency: number // 最大利益 / 必要資金
  quarterlyReturn: number // 四半期換算リターン
  annualizedReturn: number // 年率換算リターン
  timeAdjustedScore: number // 満期日数を考慮した総合スコア
  optimalTimingBonus: number // 90-120日レンジのボーナススコア
}

const OPTIMAL_DAYS_MIN = 90 // 理想的な満期範囲の最小日数
const OPTIMAL_DAYS_MAX = 120 // 理想的な満期範囲の最大日数
const QUARTER_DAYS = 91 // 四半期の日数

export const generateOptionPairs = (
  multiData: { expirations: string[]; results: Record<string, OptionPrice[]> },
  futurePrices: Record<string, FuturePrice>
): StrategyPair[] => {
  const pairs: StrategyPair[] = []
  let debugLog = ''

  const currentDate = new Date()

  // 各限月ごとに処理
  multiData.expirations.forEach((expiration) => {
    const prices = multiData.results[expiration] || []
    const futurePrice = futurePrices[expiration]

    if (!futurePrice) {
      debugLog += `⚠ ${expiration}: 先物価格なし - スキップ\n`
      return
    }

    // 満期までの日数を計算
    const expirationDate = new Date(
      parseInt(expiration.slice(0, 4)),
      parseInt(expiration.slice(4, 6)) - 1,
      parseInt(expiration.slice(6, 8))
    )
    const daysToExpiration = Math.ceil((expirationDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24))

    debugLog += `\n=== ${expiration} (${daysToExpiration}日, 先物: ${futurePrice.midPrice.toFixed(2)}) ===\n`

    const sortedPrices = prices.sort((a, b) => a.strike - b.strike)
    let pairCount = 0
    const skipReasons: Record<string, number> = {}

    // 売り候補: 先物価格 ± 1.5 の範囲（4ヶ月戦略では少し広めに）
    const futureMid = futurePrice.midPrice
    const sellCandidates = sortedPrices.filter((p) => Math.abs(p.strike - futureMid) <= 1.5 && p.midPrice > 0)

    for (const sellOption of sellCandidates) {
      const buyCandidates = sortedPrices.filter((p) => p.strike > sellOption.strike && p.midPrice > 0)

      for (const buyOption of buyCandidates) {
        const netDebit = buyOption.midPrice - sellOption.midPrice

        if (netDebit <= 0) {
          skipReasons['negative_debit'] = (skipReasons['negative_debit'] || 0) + 1
          continue
        }

        // 戦略メトリクス計算（満期日数を考慮）
        const metrics = calculateStrategyMetrics(sellOption, buyOption, netDebit, futureMid, daysToExpiration)

        // 4ヶ月戦略に最適化されたフィルタリング
        if (metrics.maxLoss > 5000) {
          // 最大損失制限
          skipReasons['max_loss'] = (skipReasons['max_loss'] || 0) + 1
          continue
        }

        if (metrics.capitalEfficiency < 0.1) {
          // 資本効率10%以上
          skipReasons['capital_efficiency'] = (skipReasons['capital_efficiency'] || 0) + 1
          continue
        }

        if (metrics.annualizedReturn < 0.05) {
          // 年率5%以上
          skipReasons['annual_return'] = (skipReasons['annual_return'] || 0) + 1
          continue
        }

        if (buyOption.strike - sellOption.strike > 10) {
          // ストライク差制限
          skipReasons['strike_diff'] = (skipReasons['strike_diff'] || 0) + 1
          continue
        }

        const pair: StrategyPair = {
          id: `${expiration}_${sellOption.strike}_${buyOption.strike}`,
          expiration,
          daysToExpiration,
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

        if (pairCount <= 2) {
          debugLog += `  ✓ ${sellOption.strike}P/${buyOption.strike}P: デビット${netDebit.toFixed(2)}, 年率${(
            metrics.annualizedReturn * 100
          ).toFixed(1)}%, 資本効率${(metrics.capitalEfficiency * 100).toFixed(
            1
          )}%, スコア${metrics.timeAdjustedScore.toFixed(3)}\n`
        }
      }
    }

    debugLog += `Result: ${pairCount} pairs (売り候補: ${sellCandidates.length}, 満期日数: ${daysToExpiration})\n`
    Object.entries(skipReasons).forEach(([reason, count]) => {
      debugLog += `  Skipped ${count} pairs due to: ${reason}\n`
    })
  })

  console.log('4ヶ月最適化戦略生成:', debugLog)

  // timeAdjustedScoreで降順ソート（4ヶ月戦略が最も高スコア）
  return pairs.sort((a, b) => b.metrics.timeAdjustedScore - a.metrics.timeAdjustedScore).slice(0, 50)
}

const calculateStrategyMetrics = (
  sellOption: OptionPrice, // ヘッジポジション
  buyOption: OptionPrice, // メインポジション
  netDebit: number, // 支払った金額
  futurePrice: number, // 先物価格
  daysToExpiration: number // 満期までの日数
): StrategyMetrics => {
  const quantity = 100
  const sellStrike = sellOption.strike
  const buyStrike = buyOption.strike

  // 基本指標
  const maxProfit = (buyStrike - sellStrike - netDebit) * quantity
  const maxLoss = netDebit * quantity
  const profitLossRatio = maxLoss > 0 ? maxProfit / maxLoss : 0
  const breakEvenPoint = buyStrike - netDebit
  const winRate = calculateWinRate(futurePrice, breakEvenPoint, daysToExpiration)

  // 資本効率指標
  const capitalEfficiency = maxLoss > 0 ? maxProfit / maxLoss : 0

  // 時間調整後リターン指標（上限設定あり）
  const rawQuarterlyReturn = capitalEfficiency * (QUARTER_DAYS / Math.max(daysToExpiration, 1))
  const quarterlyReturn = Math.min(rawQuarterlyReturn, 1.0) // 四半期リターン100%上限
  const annualizedReturn = Math.min(capitalEfficiency * (365 / Math.max(daysToExpiration, 1)), 2.0) // 年率200%上限

  // 4ヶ月戦略最適化スコア
  const optimalTimingBonus = calculateOptimalTimingBonus(daysToExpiration)

  // 総合スコア計算（各要素の重み付き平均）
  const expectedReturn = maxProfit * winRate - maxLoss * (1 - winRate)
  const riskAdjustedReturn = maxLoss > 0 ? expectedReturn / maxLoss : 0

  const timeAdjustedScore =
    riskAdjustedReturn * 0.2 + // リスク調整後リターン（20%に減少）
    quarterlyReturn * 0.3 + // 四半期リターン（30%に減少）
    optimalTimingBonus * 0.5 // 最適タイミングボーナス（50%に増加）

  return {
    maxProfit,
    maxLoss,
    profitLossRatio,
    breakEvenPoint,
    winRate,
    capitalEfficiency,
    quarterlyReturn,
    annualizedReturn,
    timeAdjustedScore,
    optimalTimingBonus,
  }
}

const calculateOptimalTimingBonus = (daysToExpiration: number): number => {
  if (daysToExpiration >= OPTIMAL_DAYS_MIN && daysToExpiration <= OPTIMAL_DAYS_MAX) {
    // 90-120日の範囲内 = 最高ボーナス
    const centerDays = (OPTIMAL_DAYS_MIN + OPTIMAL_DAYS_MAX) / 2 // 105日
    const distanceFromCenter = Math.abs(daysToExpiration - centerDays)
    const normalizedDistance = distanceFromCenter / ((OPTIMAL_DAYS_MAX - OPTIMAL_DAYS_MIN) / 2)
    return 1.0 - normalizedDistance * 0.2 // 0.8-1.0の範囲
  } else if (daysToExpiration < OPTIMAL_DAYS_MIN) {
    // 90日未満 = 短期すぎる厳しいペナルティ
    if (daysToExpiration < 30) {
      return 0.01 // 30日未満は大幅ペナルティ
    }
    const ratio = daysToExpiration / OPTIMAL_DAYS_MIN
    return Math.max(0.1, ratio * 0.4) // 0.1-0.4の範囲
  } else {
    // 120日超 = 長期すぎるペナルティ
    const excessDays = daysToExpiration - OPTIMAL_DAYS_MAX
    const penalty = Math.min(0.4, excessDays / 120) // 120日超過で40%減点
    return Math.max(0.4, 0.8 - penalty) // 0.4-0.8の範囲
  }
}

const calculateWinRate = (futurePrice: number, breakEven: number, daysToExpiration: number): number => {
  // VIX下落前提での勝率計算（時間要素を考慮）
  if (futurePrice <= breakEven) {
    return 0.15 // 既にブレイクイーブン以下なら低勝率
  }

  const priceDiff = futurePrice - breakEven

  // 時間による調整：長期ほど不確実性が高い
  const timeVolatilityFactor = 0.25 + (daysToExpiration / 365) * 0.15 // 25%-40%のボラティリティ
  const baseWinRate = 0.55 // VIX下落の基本確率

  // 価格差による勝率調整
  const priceAdjustment = Math.min(0.3, priceDiff / (futurePrice * timeVolatilityFactor))

  const finalWinRate = baseWinRate + priceAdjustment
  return Math.max(0.1, Math.min(0.9, finalWinRate))
}
