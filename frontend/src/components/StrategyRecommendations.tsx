// frontend/src/components/StrategyRecommendations.tsx
import React, { useState, useEffect } from 'react'
import { generateOptionPairs, type StrategyPair } from '../utils/strategyCalculations'
import { fetchFuturePrices } from '../api/futureService'
import type { OptionPrice } from '../types/options'

interface StrategyRecommendationsProps {
  multiData: { expirations: string[]; results: Record<string, OptionPrice[]> } | null
  onStrategySelect: (strategy: StrategyPair) => void
}

const StrategyRecommendations: React.FC<StrategyRecommendationsProps> = ({ 
  multiData, 
  onStrategySelect 
}) => {
  const [strategies, setStrategies] = useState<StrategyPair[]>([])
  const [analyzingStrategies, setAnalyzingStrategies] = useState(false)
  const [debugInfo, setDebugInfo] = useState<string>('')

  useEffect(() => {
    if (multiData) {
      analyzeStrategies()
    }
  }, [multiData])

  const analyzeStrategies = async () => {
    if (!multiData) return

    setAnalyzingStrategies(true)
    setDebugInfo('')
    
    try {
      let debug = 'Debug Info:\n'
      debug += `Total expirations: ${multiData.expirations.length}\n`

      // 1. VIX先物価格を取得
      debug += '\n=== Fetching VIX Future Prices ===\n'
      const futures = await fetchFuturePrices({ expirations: multiData.expirations })

      Object.entries(futures).forEach(([exp, future]) => {
        debug += `${exp}: ${future.midPrice.toFixed(2)} (bid=${future.bid.toFixed(2)}, ask=${future.ask.toFixed(2)})\n`
      })

      // 2. オプションデータの状況確認
      debug += '\n=== Option Data Status ===\n'
      multiData.expirations.forEach(exp => {
        const prices = multiData.results[exp] || []
        const future = futures[exp]
        
        debug += `${exp}: ${prices.length} options, future=${future?.midPrice?.toFixed(2) || 'N/A'}\n`
        
        if (prices.length > 0 && future) {
          const nearFuture = prices.filter(p => Math.abs(p.strike - future.midPrice) <= 2)
          debug += `  Near-future options (±2): ${nearFuture.length} found\n`
          nearFuture.slice(0, 3).forEach(p => {
            debug += `    ${p.strike}P: ${p.midPrice.toFixed(3)}\n`
          })
        }
      })
      
      // 3. 戦略生成（2つの引数で呼び出し）
      debug += '\n=== Strategy Generation ===\n'
      await new Promise(resolve => setTimeout(resolve, 500))
      const pairs = generateOptionPairs(multiData, futures)
      
      debug += `Generated pairs: ${pairs.length}\n`
      if (pairs.length > 0) {
        debug += `Top 3 strategies:\n`
        pairs.slice(0, 3).forEach((pair, i) => {
          debug += `  ${i+1}. ${pair.expiration} SELL ${pair.sellStrike}P(${pair.sellPrice.toFixed(2)}) / BUY ${pair.buyStrike}P(${pair.buyPrice.toFixed(2)})\n`
          debug += `     Future: ${pair.futurePrice.toFixed(2)}, Debit: ${pair.netDebit.toFixed(2)}, Days: ${pair.daysToExpiration}, Score: ${pair.metrics.timeAdjustedScore.toFixed(3)}\n`
        })
      }
      
      setDebugInfo(debug)
      setStrategies(pairs.slice(0, 5))
      console.log('戦略分析完了:', debug)
      
    } catch (err) {
      console.error('Strategy analysis error:', err)
      setDebugInfo(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setAnalyzingStrategies(false)
    }
  }

  const formatExpirationShort = (exp: string) => {
    return `${exp.slice(2, 4)}/${exp.slice(4, 6)}/${exp.slice(6, 8)}`
  }

  if (!multiData) return null

  return (
    <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-white">4-Month Rolling VIX Strategy</h2>
        <button
          onClick={analyzeStrategies}
          disabled={analyzingStrategies}
          className="px-3 py-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded text-sm font-medium transition-all duration-200"
        >
          {analyzingStrategies ? 'Analyzing...' : 'Re-analyze'}
        </button>
      </div>

      {debugInfo && (
        <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
          <details>
            <summary className="text-yellow-400 text-sm cursor-pointer mb-2">Debug Information (Click to expand)</summary>
            <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">{debugInfo}</pre>
          </details>
        </div>
      )}

      {analyzingStrategies ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto"></div>
          <p className="text-gray-400 mt-4">Fetching VIX futures & analyzing strategies...</p>
        </div>
      ) : strategies.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {strategies.map((strategy, index) => (
              <div
                key={strategy.id}
                className="bg-gradient-to-br from-blue-600/20 to-green-600/20 rounded-lg p-4 border border-blue-500/30 hover:border-blue-400/50 transition-all duration-200"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="text-sm text-gray-300">Strategy #{index + 1}</div>
                  <div className="text-xs bg-green-600/30 px-2 py-1 rounded text-green-300">
                    Score: {strategy.metrics.timeAdjustedScore.toFixed(3)}
                  </div>
                </div>

                {/* Future Price Reference */}
                <div className="bg-yellow-600/20 rounded p-2 mb-3 text-xs">
                  <div className="text-yellow-300 font-medium">VIX Future: {strategy.futurePrice.toFixed(2)}</div>
                  <div className="text-gray-400">{formatExpirationShort(strategy.expiration)}</div>
                </div>

                {/* Strategy Details */}
                <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                  <div className="bg-red-500/20 rounded p-2">
                    <div className="text-red-400 font-medium">SELL: {strategy.sellStrike}P</div>
                    <div className="text-gray-400">Hedge (Near Future)</div>
                    <div className="text-white">${strategy.sellPrice.toFixed(2)}</div>
                  </div>
                  <div className="bg-green-500/20 rounded p-2">
                    <div className="text-green-400 font-medium">BUY: {strategy.buyStrike}P</div>
                    <div className="text-gray-400">Main Profit</div>
                    <div className="text-white">${strategy.buyPrice.toFixed(2)}</div>
                  </div>
                </div>

                {/* Time & Efficiency Metrics */}
                <div className="bg-blue-600/20 rounded p-2 mb-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-blue-300">Days to Exp:</span>
                    <span className="text-white font-mono">{strategy.daysToExpiration}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-300">Quarterly Return:</span>
                    <span className="text-blue-200 font-mono">{(strategy.metrics.quarterlyReturn * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-300">Annual Return:</span>
                    <span className="text-blue-200 font-mono">{(strategy.metrics.annualizedReturn * 100).toFixed(1)}%</span>
                  </div>
                </div>

                {/* Metrics */}
                <div className="space-y-2 text-xs mb-4">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Net Debit:</span>
                    <span className="text-red-400 font-mono">-${strategy.netDebit.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Max Profit:</span>
                    <span className="text-green-400 font-mono">+${strategy.metrics.maxProfit.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Max Loss:</span>
                    <span className="text-red-400 font-mono">-${strategy.metrics.maxLoss.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Capital Eff:</span>
                    <span className="text-yellow-400 font-mono">{(strategy.metrics.capitalEfficiency * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Win Rate:</span>
                    <span className="text-yellow-400 font-mono">{(strategy.metrics.winRate * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Break Even:</span>
                    <span className="text-white font-mono">{strategy.metrics.breakEvenPoint.toFixed(1)}</span>
                  </div>
                </div>

                <button
                  onClick={() => onStrategySelect(strategy)}
                  className="w-full bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700 text-white text-sm py-2 rounded font-medium transition-all duration-200 transform hover:scale-[1.02]"
                >
                  Apply Strategy
                </button>
              </div>
            ))}
          </div>

          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="text-blue-300 text-sm">
              <div className="font-medium mb-1">4-Month Rolling VIX Decline Strategy:</div>
              <div className="text-xs space-y-1">
                <p>• SELL PUT near future price (hedge), BUY PUT higher strike (main profit)</p>
                <p>• Optimized for 90-120 day expirations with quarterly rolling schedule</p>
                <p>• Scores prioritize: Quarterly Return (40%) + Risk-Adjusted Return (30%) + Optimal Timing (30%)</p>
                <p>• Max profit when VIX falls significantly below sell strike at expiration</p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-8">
          <div className="text-gray-400 mb-2">No optimal strategies found</div>
          <div className="text-xs text-gray-500">VIX futures may be too low or options not liquid enough</div>
        </div>
      )}
    </div>
  )
}

export default StrategyRecommendations