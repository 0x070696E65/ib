// frontend/src/pages/PositionsPage.tsx
import { useState, useEffect, useRef } from 'react'
import { PositionMonitor, fetchCurrentPositions, controlMonitoring } from '../api/positionService'
import type { Position, PositionStatus } from '../api/positionService'

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([])
  const [status, setStatus] = useState<PositionStatus | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isMonitoring, setIsMonitoring] = useState(false) // 明確な監視状態管理
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [marketMessage, setMarketMessage] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)
  
  const monitorRef = useRef<PositionMonitor | null>(null)

  useEffect(() => {
    // 初期データ読み込み（自動では監視開始しない）
    loadInitialData()

    return () => {
      if (monitorRef.current) {
        monitorRef.current.disconnect()
      }
    }
  }, [])

  const loadInitialData = async () => {
    try {
      setLoading(true)
      const data = await fetchCurrentPositions()
      setPositions(data.positions)
      setStatus(data.status)
    } catch (err) {
      setError('初期データの読み込みに失敗しました')
      console.error('Initial data load error:', err)
    } finally {
      setLoading(false)
    }
  }

  const startPositionMonitoring = () => {
    if (monitorRef.current) {
      monitorRef.current.disconnect()
    }

    const monitor = new PositionMonitor()
    monitorRef.current = monitor
    setIsMonitoring(true)
    setError(null)

    // イベントリスナー設定
    monitor.on('initial', (data: unknown) => {
      const parsedData = data as { positions: Position[]; status: PositionStatus }
      console.log('Initial data received:', parsedData.positions.length)
      setPositions(parsedData.positions)
      setStatus(parsedData.status)
      setIsConnected(true)
      setLastUpdate(new Date().toLocaleTimeString())
    })

    monitor.on('positions', (data: unknown) => {
      const newPositions = data as Position[]
      console.log('Positions updated:', newPositions.length)
      
      // 既存のPnLデータを保持しながらポジションを更新
      setPositions(prevPositions => {
        const updatedPositions = newPositions.map(newPos => {
          const existingPos = prevPositions.find(p => p.contractId === newPos.contractId)
          // 既存のPnLデータがあれば保持
          return existingPos ? { ...newPos, 
            dailyPnL: existingPos.dailyPnL, 
            unrealizedPnL: existingPos.unrealizedPnL,
            realizedPnL: existingPos.realizedPnL,
            value: existingPos.value
          } : newPos
        })
        return updatedPositions
      })
      
      setLastUpdate(new Date().toLocaleTimeString())
    })

    monitor.on('pnl', (data: unknown) => {
      const pnlData = data as Position
      console.log('PnL updated:', pnlData.contractId, pnlData.unrealizedPnL)
      setPositions(prev => prev.map(pos => 
        pos.contractId === pnlData.contractId 
          ? { ...pos, ...pnlData }
          : pos
      ))
      setLastUpdate(new Date().toLocaleTimeString())
    })

    monitor.on('marketStatus', (data: unknown) => {
      const marketData = data as { status: string; message?: string }
      setMarketMessage(marketData.message || `市場状況: ${marketData.status}`)
    })

    monitor.on('status', (data: unknown) => {
      const statusData = data as { message: string }
      setMarketMessage(statusData.message)
    })

    monitor.on('error', (data: unknown) => {
      const errorData = data as { message: string }
      setError(errorData.message)
      // エラーが発生しても監視は継続（接続エラーでない限り）
    })

    monitor.on('connectionError', (data: unknown) => {
      console.error('Connection error:', data)
      setError('接続エラーが発生しました - 再接続を試行中...')
      setIsConnected(false)
      // 監視状態は維持（自動再接続のため）
    })

    monitor.connect()
  }

  const stopPositionMonitoring = () => {
    if (monitorRef.current) {
      monitorRef.current.disconnect()
      monitorRef.current = null
    }
    setIsMonitoring(false)
    setIsConnected(false)
    setMarketMessage(null)
  }

  const handleControlMonitoring = async (action: 'start' | 'stop') => {
    try {
      setLoading(true)
      
      if (action === 'start') {
        // サーバー側の監視開始
        await controlMonitoring('start')
        // クライアント側の監視開始
        startPositionMonitoring()
      } else {
        // サーバー側の監視停止
        await controlMonitoring('stop')
        // クライアント側の監視停止
        stopPositionMonitoring()
      }
    } catch (err) {
      console.error(`${action} monitoring error:`, err)
      setError(`監視${action === 'start' ? '開始' : '停止'}に失敗しました`)
    } finally {
      setLoading(false)
    }
  }

  const formatPnL = (value: number | undefined) => {
    if (value === undefined) return '-'
    const color = value >= 0 ? 'text-green-400' : 'text-red-400'
    const sign = value >= 0 ? '+' : ''
    return <span className={color}>{sign}${value.toFixed(2)}</span>
  }

  // 総損益計算
  const calculateTotalPnL = () => {
    const totalDaily = positions.reduce((sum, pos) => sum + (pos.dailyPnL || 0), 0)
    const totalUnrealized = positions.reduce((sum, pos) => sum + (pos.unrealizedPnL || 0), 0)
    const totalRealized = positions.reduce((sum, pos) => sum + (pos.realizedPnL || 0), 0)
    const totalValue = positions.reduce((sum, pos) => sum + (pos.value || 0), 0)
    
    return { totalDaily, totalUnrealized, totalRealized, totalValue }
  }

  const { totalDaily, totalUnrealized, totalRealized, totalValue } = calculateTotalPnL()
  const vixPositions = positions.filter(pos => pos.symbol === 'VIX')
  const otherPositions = positions.filter(pos => pos.symbol !== 'VIX')

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
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-green-500 to-blue-600 rounded-full mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent mb-2">
            Real-time Positions Monitor
          </h1>
          <p className="text-gray-400 text-lg">Live position tracking with P&L updates</p>
        </div>

        {/* Status Bar */}
        <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-4 mb-6">
          <div className="flex flex-col space-y-4">
            {/* First Row: Status and Control */}
            <div className="flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0">
              <div className="flex items-center space-x-6">
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
                  <span className="text-white">{isConnected ? '接続中' : '未接続'}</span>
                </div>
                
                <div className="text-white">
                  監視: <span className={isMonitoring ? 'text-green-400' : 'text-gray-400'}>
                    {isMonitoring ? 'ON' : 'OFF'}
                  </span>
                </div>
                
                {status && (
                  <>
                    <div className="text-white">
                      市場: <span className={status.marketStatus.isOpen ? 'text-green-400' : 'text-orange-400'}>
                        {status.marketStatus.isOpen ? '開場' : '閉場'}
                      </span>
                    </div>
                    <div className="text-white">
                      ポジション: <span className="text-blue-400">{positions.length}</span>
                    </div>
                  </>
                )}
                
                {lastUpdate && (
                  <div className="text-gray-400">
                    最終更新: {lastUpdate}
                  </div>
                )}
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => handleControlMonitoring('start')}
                  disabled={loading || isMonitoring}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200"
                >
                  監視開始
                </button>
                <button
                  onClick={() => handleControlMonitoring('stop')}
                  disabled={loading || !isMonitoring}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200"
                >
                  監視停止
                </button>
                <button
                  onClick={loadInitialData}
                  disabled={loading}
                  title="リアルタイム監視を使わずに現在のポジション情報を1回だけ取得"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200"
                >
                  {loading ? '更新中...' : '更新'}
                </button>
              </div>
            </div>

            {/* Second Row: Total P&L */}
            {positions.length > 0 && (
              <div className="border-t border-white/10 pt-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white/5 rounded-lg p-3 text-center">
                    <div className="text-sm text-gray-400">日次損益</div>
                    <div className="text-lg font-mono font-semibold">
                      {formatPnL(totalDaily)}
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3 text-center">
                    <div className="text-sm text-gray-400">含み損益</div>
                    <div className="text-lg font-mono font-semibold">
                      {formatPnL(totalUnrealized)}
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3 text-center">
                    <div className="text-sm text-gray-400">実現損益</div>
                    <div className="text-lg font-mono font-semibold">
                      {formatPnL(totalRealized)}
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3 text-center">
                    <div className="text-sm text-gray-400">総価値</div>
                    <div className="text-lg font-mono font-semibold text-white">
                      ${totalValue.toFixed(2)}
                    </div>
                  </div>
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
                  閉じる
                </button>
              </div>
            )}

            {marketMessage && (
              <div className="p-3 bg-orange-500/20 border border-orange-500/30 rounded-lg">
                <div className="text-orange-300">{marketMessage}</div>
              </div>
            )}
          </div>
        </div>

        {/* VIX Positions */}
        {vixPositions.length > 0 && (
          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">VIX Positions</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="text-left py-3 px-4 text-white font-semibold">Symbol</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Strike</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Type</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Expiry</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Position</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Avg Cost</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Daily P&L</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Unrealized</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {vixPositions.map((pos) => (
                    <tr key={`vix-${pos.contractId || pos.localSymbol}`} className="border-b border-white/10 hover:bg-white/5">
                      <td className="py-3 px-4 text-white font-medium">{pos.symbol}</td>
                      <td className="py-3 px-4 text-white">{pos.strike || '-'}</td>
                      <td className="py-3 px-4 text-white">{pos.optionType || pos.secType}</td>
                      <td className="py-3 px-4 text-white">{pos.expiry ? pos.expiry.slice(2) : '-'}</td>
                      <td className="py-3 px-4 text-white font-mono">{pos.position}</td>
                      <td className="py-3 px-4 text-white font-mono">${pos.avgCost.toFixed(2)}</td>
                      <td className="py-3 px-4 font-mono">{formatPnL(pos.dailyPnL)}</td>
                      <td className="py-3 px-4 font-mono">{formatPnL(pos.unrealizedPnL)}</td>
                      <td className="py-3 px-4 text-white font-mono">${pos.value?.toFixed(2) || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Other Positions */}
        {otherPositions.length > 0 && (
          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Other Positions</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="text-left py-3 px-4 text-white font-semibold">Symbol</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Type</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Position</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Avg Cost</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Daily P&L</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Unrealized</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {otherPositions.map((pos) => (
                    <tr key={`other-${pos.contractId || pos.localSymbol}`} className="border-b border-white/10 hover:bg-white/5">
                      <td className="py-3 px-4 text-white font-medium">{pos.symbol}</td>
                      <td className="py-3 px-4 text-white">{pos.secType}</td>
                      <td className="py-3 px-4 text-white font-mono">{pos.position}</td>
                      <td className="py-3 px-4 text-white font-mono">${pos.avgCost.toFixed(2)}</td>
                      <td className="py-3 px-4 font-mono">{formatPnL(pos.dailyPnL)}</td>
                      <td className="py-3 px-4 font-mono">{formatPnL(pos.unrealizedPnL)}</td>
                      <td className="py-3 px-4 text-white font-mono">${pos.value?.toFixed(2) || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {positions.length === 0 && !loading && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-xl text-white/70 mb-2">No positions found</h3>
            <p className="text-gray-400 mb-6">Start monitoring to load current positions</p>
            <button
              onClick={() => handleControlMonitoring('start')}
              disabled={loading}
              className="px-6 py-3 bg-gradient-to-r from-green-500 to-blue-600 text-white rounded-xl hover:from-green-600 hover:to-blue-700 transition-all duration-200"
            >
              Start Monitoring
            </button>
          </div>
        )}
      </div>
    </div>
  )
}