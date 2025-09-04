// frontend/src/pages/OptionMatrixPage.tsx
import { useState, useEffect, useCallback } from 'react'
import {
  fetchAvailableExpirations,
  calculateProfit,
  fetchOptionPrices,
  type CalculateRequest
} from '../api/optionService'
import type { Expiration, OptionPrice } from '../types/options'
import StrategyRecommendations from '../components/StrategyRecommendations'
import CacheStatus from '../components/CacheStatus'
import type { StrategyPair } from '../utils/strategyCalculations'
import type { CacheData } from '../api/cacheService'
import { savePriceDataToCache } from '../api/cacheService'
import { fetchFuturePrices } from "../api/futureService"
interface SelectedPosition {
  id: string // expiration_strike で一意識別
  expiration: string
  strike: number
  price: number
  quantity: number
}

interface ProfitMatrix {
  vixPrices: number[]
  positions: SelectedPosition[]
  matrix: number[][] // [vixPriceIndex][positionIndex] = profit
  totalProfits: number[] // [vixPriceIndex] = total profit
}

export default function OptionMatrixPage() {
  const [expirations, setExpirations] = useState<Expiration[]>([])
  const [strikeMin, setStrikeMin] = useState(15)
  const [strikeMax, setStrikeMax] = useState(30)
  const [stepSize, setStepSize] = useState(1)

  // マルチ限月データ
  const [multiData, setMultiData] = useState<{
    expirations: string[]
    results: Record<string, OptionPrice[]>
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // 選択ポジション管理
  const [selectedPositions, setSelectedPositions] = useState<SelectedPosition[]>([])
  const [profitMatrix, setProfitMatrix] = useState<ProfitMatrix | null>(null)
  const [calculatingProfit, setCalculatingProfit] = useState(false)

  useEffect(() => {
    loadExpirations()
  }, [])

  const loadExpirations = async () => {
    try {
      const data = await fetchAvailableExpirations()
      setExpirations(data)
    } catch (err) {
      setError('満期日の読み込みに失敗しました')
      console.error('Expiration load error:', err)
    }
  }

  const handleFetchAllPrices = async () => {
    if (expirations.length === 0) {
      setError('満期日データがありません')
      return
    }

    if (strikeMin >= strikeMax) {
      setError('ストライク範囲が無効です')
      return
    }

    if (strikeMax - strikeMin > 20) {
      setError('ストライク範囲は20以下にしてください')
      return
    }

    const startTime = Date.now()
    setLoading(true)
    setError(null)
    setMultiData(null)
    setProgress({ current: 0, total: expirations.length })

    try {
      const allResults: Record<string, OptionPrice[]> = {}
      const allExpirations: string[] = []

      // 各限月を個別に取得
      for (let i = 0; i < expirations.length; i++) {
        const expiration = expirations[i]
        
        try {
          const request = {
            expiration: expiration.expiration,
            strikeMin,
            strikeMax,
            stepSize
          }

          const data = await fetchOptionPrices(request)
          
          allResults[expiration.expiration] = data.prices
          allExpirations.push(expiration.expiration)
          
          // 進捗更新
          setProgress({ current: i + 1, total: expirations.length })
          
          console.log(`限月 ${expiration.formatted} 取得完了: ${data.prices.length}件`)
          
        } catch (expError) {
          console.error(`限月 ${expiration.formatted} の取得に失敗:`, expError)
          // 個別のエラーは続行（空配列で処理）
          allResults[expiration.expiration] = []
          allExpirations.push(expiration.expiration)
        }
      }
      
      setMultiData({
        expirations: allExpirations,
        results: allResults
      })
      
      const totalPrices = Object.values(allResults).reduce((sum, prices) => sum + prices.length, 0)
      console.log(`全限月価格取得完了: ${totalPrices}件`)

      // キャッシュに保存（エラーが出ても処理は継続）
      try {
        // 先物価格も取得する必要があります
        const futures = await fetchFuturePrices({ expirations: allExpirations })
        
        const fetchDuration = (Date.now() - startTime) / 1000
        await savePriceDataToCache({
          expirations: allExpirations,
          strikeMin,
          strikeMax,
          stepSize,
          optionPrices: allResults,
          futurePrices: futures,
          strategies: [], // 空配列でOK
          fetchDuration
        })
        console.log('データをキャッシュに保存しました')
      } catch (cacheError) {
        console.error('キャッシュ保存エラー（処理は継続）:', cacheError)
      }
    } catch (err) {
      setError('価格取得に失敗しました')
      console.error('Multi price fetch error:', err)
    } finally {
      setLoading(false)
      setTimeout(() => setProgress(null), 1000)
    }
  }

  const handleCellClick = (expiration: string, strike: number, price: number) => {
    const id = `${expiration}_${strike}`
    
    // 既に選択済みかチェック
    if (selectedPositions.some(pos => pos.id === id)) {
      // 選択解除
      setSelectedPositions(prev => prev.filter(pos => pos.id !== id))
      return // 既に選択済みなので何もしない
    }

    const newPosition: SelectedPosition = {
      id,
      expiration,
      strike,
      price,
      quantity: 100
    }

    setSelectedPositions(prev => [...prev, newPosition])
  }

  const handleRemovePosition = (id: string) => {
    setSelectedPositions(prev => prev.filter(pos => pos.id !== id))
  }

  const handleQuantityChange = (id: string, quantity: number) => {
    setSelectedPositions(prev => 
      prev.map(pos => pos.id === id ? { ...pos, quantity } : pos)
    )
  }

  const handleClearAll = () => {
    setSelectedPositions([])
    setProfitMatrix(null)
  }

  const calculateCombinedProfit = useCallback(async () => {
    if (selectedPositions.length === 0) return

    setCalculatingProfit(true)
    setProfitMatrix(null)

    try {
      // シナリオ範囲の決定
      const minStrike = Math.min(...selectedPositions.map(pos => pos.strike))
      const maxStrike = Math.max(...selectedPositions.map(pos => pos.strike))
      const scenarioMin = Math.max(1, minStrike - 10)
      const scenarioMax = maxStrike + 10
      
      const vixPrices: number[] = []
      for (let price = scenarioMin; price <= scenarioMax; price++) {
        vixPrices.push(price)
      }

      // 各ポジションの損益を並列計算
      const profitPromises = selectedPositions.map(async (position) => {
        const request: CalculateRequest = {
          strike: position.strike,
          premium: position.price,
          quantity: position.quantity,
          scenarioMin,
          scenarioMax,
          stepSize: 1
        }
        
        const result = await calculateProfit(request)
        return result.scenarios
      })

      const allProfits = await Promise.all(profitPromises)
      
      // 損益マトリックス構築
      const matrix: number[][] = []
      const totalProfits: number[] = []

      vixPrices.forEach((vixPrice) => {
        const rowProfits: number[] = []
        let totalProfit = 0

        selectedPositions.forEach((_, posIndex) => {
          const positionProfits = allProfits[posIndex]
          const scenario = positionProfits.find(s => s.futurePrice === vixPrice)
          const profit = scenario ? scenario.profit : 0
          
          rowProfits.push(profit)
          totalProfit += profit
        })

        matrix.push(rowProfits)
        totalProfits.push(totalProfit)
      })

      setProfitMatrix({
        vixPrices,
        positions: selectedPositions,
        matrix,
        totalProfits
      })

    } catch (err) {
      console.error('Combined profit calculation error:', err)
      setError('合算損益計算に失敗しました')
    } finally {
      setCalculatingProfit(false)
    }
  }, [selectedPositions])

  const handleStrategySelect = (strategy: StrategyPair) => {
    const newPositions: SelectedPosition[] = [
      {
        id: `${strategy.expiration}_${strategy.sellStrike}`,
        expiration: strategy.expiration,
        strike: strategy.sellStrike,
        price: strategy.sellPrice,
        quantity: -strategy.quantity // 売り（ヘッジ）なので負数
      },
      {
        id: `${strategy.expiration}_${strategy.buyStrike}`,
        expiration: strategy.expiration,
        strike: strategy.buyStrike,
        price: strategy.buyPrice,
        quantity: strategy.quantity // 買い（メイン）なので正数
      }
    ]
    
    setSelectedPositions(newPositions)
    console.log(`VIX下落戦略適用: SELL ${strategy.sellStrike}P (ヘッジ) / BUY ${strategy.buyStrike}P (メイン利益)`)
  }

  useEffect(() => {
    if (selectedPositions.length > 0) {
      calculateCombinedProfit()
    } else {
      setProfitMatrix(null)
    }
  }, [selectedPositions, calculateCombinedProfit])

  const formatPrice = (value: number) => value.toFixed(2)
  const formatProfit = (value: number) => {
    const color = value >= 0 ? 'text-green-400' : 'text-red-400'
    const sign = value >= 0 ? '+' : ''
    return <span className={color}>{sign}{value.toFixed(0)}</span>
  }

  const formatExpiration = (exp: string) => {
    return `${exp.slice(0, 4)}-${exp.slice(4, 6)}-${exp.slice(6, 8)}`
  }

  const isPositionSelected = (expiration: string, strike: number) => {
    return selectedPositions.some(pos => pos.expiration === expiration && pos.strike === strike)
  }

  // マトリックス表示用のストライク一覧を生成
  const getStrikeRange = () => {
    const strikes: number[] = []
    for (let strike = strikeMin; strike <= strikeMax; strike += stepSize) {
      strikes.push(strike)
    }
    return strikes
  }

  const strikes = getStrikeRange()

  return (
    <div className="w-screen min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 overflow-x-hidden">
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}></div>
      </div>
      
      <div className="relative z-10 p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent mb-2">
            Multi-Expiration Option Matrix
          </h1>
          <p className="text-gray-400 text-lg">Advanced multi-position profit analysis</p>
        </div>

        <CacheStatus 
          onLoadFromCache={(data: CacheData) => {
          const expirations = data.expirations || Object.keys(data.optionPrices || {})

          if (!Array.isArray(expirations) || expirations.length === 0) {
            console.error('No valid expirations found')
            setError('キャッシュデータが不正です')
            return
          }
          
          const newMultiData = {
            expirations: expirations,
            results: data.optionPrices || {}
          }
          
          setMultiData(newMultiData)
        }}
          onClearCache={() => {
            setMultiData(null)
          }}
        />

        {/* Control Panel */}
        <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">Strike Range Settings</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Strike Min</label>
              <input
                type="number"
                value={strikeMin}
                onChange={(e) => setStrikeMin(Number(e.target.value))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Strike Max</label>
              <input
                type="number"
                value={strikeMax}
                onChange={(e) => setStrikeMax(Number(e.target.value))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Step Size</label>
              <select
                value={stepSize}
                onChange={(e) => setStepSize(Number(e.target.value))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={5}>5</option>
              </select>
            </div>
            
            <div className="flex items-end">
              <button
                onClick={handleFetchAllPrices}
                disabled={loading || expirations.length === 0}
                className="w-full px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all duration-200"
              >
                {loading ? 'Fetching...' : 'Fetch All Prices'}
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          {progress && (
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-300 mb-1">
                <span>Progress</span>
                <span>{progress.current} / {progress.total} expirations</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-purple-600 to-pink-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                ></div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
              <div className="text-red-300">{error}</div>
              <button 
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-300 text-sm underline mt-1"
              >
                Close
              </button>
            </div>
          )}
        </div>

        {/* Strategy Recommendations */}
        <StrategyRecommendations 
          multiData={multiData}
          onStrategySelect={handleStrategySelect}
        />

        {/* Price Matrix */}
        {multiData && (
          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-white">
                PUT Option Price Matrix
              </h2>
              {selectedPositions.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-all duration-200"
                >
                  Clear All ({selectedPositions.length})
                </button>
              )}
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="text-left py-3 px-2 text-white font-semibold">Strike</th>
                    {multiData?.expirations?.map((exp) => (
                      <th key={exp} className="text-center py-3 px-2 text-white font-semibold whitespace-nowrap">
                        {formatExpiration(exp)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {strikes.map((strike) => (
                    <tr key={strike} className="border-b border-white/10">
                      <td className="py-2 px-2 text-white font-medium">{strike}</td>
                      {multiData?.expirations?.map((exp) => {
                        const prices = multiData.results[exp] || []
                        const priceData = prices.find(p => p.strike === strike)
                        const isSelected = isPositionSelected(exp, strike)
                        
                        return (
                          <td key={`${exp}_${strike}`} className="py-2 px-2">
                            {priceData ? (
                              <button
                                onClick={() => handleCellClick(exp, strike, priceData.midPrice)}
                                className={`w-full px-2 py-1 rounded text-center font-mono text-xs transition-all duration-200 ${
                                  isSelected
                                    ? 'bg-blue-600 text-white shadow-lg'
                                    : 'bg-gray-800 hover:bg-gray-700 text-white hover:shadow-md'
                                }`}
                              >
                                {isSelected && (
                                  <span className="inline-block mr-1">✓</span>
                                )}
                                {formatPrice(priceData.midPrice)}
                              </button>
                            ) : (
                              <span className="text-gray-500 text-center block">-</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Selected Positions */}
        {selectedPositions.length > 0 && (
          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">Selected Positions</h2>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="text-left py-3 px-4 text-white font-semibold">Expiration</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Strike</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Price</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Quantity</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Premium</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPositions.map((position) => (
                    <tr key={position.id} className="border-b border-white/10 hover:bg-white/5">
                      <td className="py-3 px-4 text-white">{formatExpiration(position.expiration)}</td>
                      <td className="py-3 px-4 text-white font-medium">{position.strike}</td>
                      <td className="py-3 px-4 text-white font-mono">{formatPrice(position.price)}</td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          value={position.quantity}
                          onChange={(e) => handleQuantityChange(position.id, Number(e.target.value))}
                          step="100"
                          className="w-20 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-center focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                      </td>
                      <td className="py-3 px-4 text-green-400 font-mono">
                        {(position.price * Math.abs(position.quantity)).toFixed(0)}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleRemovePosition(position.id)}
                          className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium transition-all duration-200"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Profit Matrix */}
        {profitMatrix && (
          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">Combined Profit Analysis</h2>
            
            {calculatingProfit ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto"></div>
                <p className="text-gray-400 mt-4">Calculating combined profit scenarios...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/20">
                      <th className="text-left py-3 px-2 text-white font-semibold">VIX Price</th>
                      {profitMatrix.positions.map((pos) => (
                        <th key={pos.id} className="text-center py-3 px-2 text-white font-semibold whitespace-nowrap">
                          {formatExpiration(pos.expiration)}<br/>{pos.strike}P
                        </th>
                      ))}
                      <th className="text-center py-3 px-2 text-yellow-400 font-semibold bg-white/10">
                        Combined
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {profitMatrix.vixPrices
                      .map((vixPrice, vixIndex) => ({
                        vixPrice,
                        row: profitMatrix.matrix[vixIndex],
                        total: profitMatrix.totalProfits[vixIndex],
                      }))
                      .sort((a, b) => b.vixPrice - a.vixPrice) // 降順ソート
                      .map(({ vixPrice, row, total }) => (
                        <tr key={vixPrice} className="border-b border-white/10 hover:bg-white/5">
                          <td className="py-2 px-2 text-white font-medium">{vixPrice}</td>
                          {row.map((profit, posIndex) => (
                            <td
                              key={posIndex}
                              className="py-2 px-2 text-center font-mono text-xs"
                            >
                              {formatProfit(profit)}
                            </td>
                          ))}
                          <td className="py-2 px-2 text-center font-mono text-sm font-semibold bg-white/5">
                            {formatProfit(total)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!loading && !multiData && !error && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-xl text-white/70 mb-2">No price data</h3>
            <p className="text-gray-400 mb-6">Set strike range and click "Fetch All Prices" to get started</p>
          </div>
        )}
      </div>
    </div>
  )
}