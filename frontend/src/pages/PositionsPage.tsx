// frontend/src/pages/PositionsPage.tsx
import { useState, useEffect, useRef } from 'react'
import { PositionMonitor, fetchCurrentPositions, controlMonitoring } from '../api/positionService'
import type { Position, PositionStatus } from '../api/positionService'

interface AccountPnL {
  dailyPnL: number
  unrealizedPnL: number
  realizedPnL: number
}

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([])
  const [status, setStatus] = useState<PositionStatus | null>(null)
  const [accountPnL, setAccountPnL] = useState<AccountPnL | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pnlErrors, setPnlErrors] = useState<Set<number>>(new Set())
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)
  
  const monitorRef = useRef<PositionMonitor | null>(null)

  // 初回データ読み込み
  useEffect(() => {
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
      data.positions.sort((a, b) => {
        if (!a.expiry) return 1
        if (!b.expiry) return -1
        return parseInt(a.expiry, 10) - parseInt(b.expiry, 10)
      })
      setPositions(data.positions)
      setStatus(data.status)
      setLastUpdate(new Date().toLocaleTimeString())
    } catch (err) {
      setError('データの読み込みに失敗しました')
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
      setPositions(newPositions)
      setLastUpdate(new Date().toLocaleTimeString())
    })

    monitor.on('pnl', (data: unknown) => {
      const pnlData = data as Position
      setPositions(prev => prev.map(pos => 
        pos.contractId === pnlData.contractId 
          ? { ...pos, ...pnlData }
          : pos
      ))
      setLastUpdate(new Date().toLocaleTimeString())
    })

    monitor.on('accountPnl', (data: unknown) => {
      const pnlData = data as AccountPnL
      console.log('Account PnL updated:', pnlData)
      setAccountPnL(pnlData)
      setLastUpdate(new Date().toLocaleTimeString())
    })

    monitor.on('pnlError', (data: unknown) => {
      const errorData = data as { contractId: number; error: string }
      setPnlErrors(prev => new Set(prev).add(errorData.contractId))
      console.warn(`PnL取得エラー Contract ${errorData.contractId}: ${errorData.error}`)
    })

    monitor.on('status', (data: unknown) => {
      const statusData = data as { status: string; message: string }
      console.log('Status update:', statusData.message)
    })

    monitor.on('error', (data: unknown) => {
      const errorData = data as { message: string }
      setError(errorData.message)
    })

    monitor.on('connectionError', () => {
      setError('接続エラーが発生しました - 再接続を試行中...')
      setIsConnected(false)
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
    setAccountPnL(null)
  }

  const handleControlMonitoring = async (action: 'start' | 'stop') => {
    try {
      setLoading(true)
      
      if (action === 'start') {
        await controlMonitoring('start')
        startPositionMonitoring()
      } else {
        await controlMonitoring('stop')
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
    const sign = value >= 0 ? '+' : '-'
    return <span className={color}>{sign}${Math.abs(value).toFixed(2)}</span>
  }

  // PnL表示の優先順位: アカウント全体のPnL > 個別ポジションの合計
  const getDisplayPnL = () => {
    if (accountPnL) {
      return {
        totalDaily: accountPnL.dailyPnL,
        totalUnrealized: accountPnL.unrealizedPnL,
        totalRealized: accountPnL.realizedPnL,
        isAccountLevel: true
      }
    } else {
      const totalDaily = positions.reduce((sum, pos) => sum + (pos.dailyPnL || 0), 0)
      const totalUnrealized = positions.reduce((sum, pos) => sum + (pos.unrealizedPnL || 0), 0)
      const totalRealized = positions.reduce((sum, pos) => sum + (pos.realizedPnL || 0), 0)
      return {
        totalDaily,
        totalUnrealized,
        totalRealized,
        isAccountLevel: false
      }
    }
  }

  const { totalDaily, totalUnrealized, totalRealized, isAccountLevel } = getDisplayPnL()
  const totalValue = positions.reduce((sum, pos) => sum + (pos.value || pos.marketValue || 0), 0)
  
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
            {/* Control Row */}
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
                        {status.marketStatus.isOpen ? '開場' : '時間外'}
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
                  disabled={loading || isMonitoring}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200"
                >
                  {loading ? '更新中...' : '更新'}
                </button>
              </div>
            </div>

            {/* Total P&L Row */}
            {(positions.length > 0 || accountPnL) && (
              <div className="border-t border-white/10 pt-4">
                <div className="mb-2 text-center">
                  <span className="text-xs text-gray-400">
                    {isAccountLevel ? 'アカウント全体のPnL' : 'ポジション合計（個別損益）'}
                  </span>
                </div>
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

            {/* Error Display */}
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

            {/* PnL Error Notification */}
            {pnlErrors.size > 0 && (
              <div className="p-3 bg-yellow-500/20 border border-yellow-500/30 rounded-lg">
                <div className="text-yellow-300">
                  {pnlErrors.size}件のポジションで個別PnL取得に失敗しました。アカウント全体のPnLは正常に表示されています。
                </div>
              </div>
            )}

            {/* Market Status */}
            {status && !status.marketStatus.isOpen && positions.length > 0 && (
              <div className="p-3 bg-orange-500/20 border border-orange-500/30 rounded-lg">
                <div className="text-orange-300 text-center">
                  市場時間外 - 一部の数値は最終取引日の値です
                </div>
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
                    <th className="text-left py-3 px-4 text-white font-semibold">Mark</th>
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
                      <td className="py-3 px-4 font-mono text-white">${pos.mark?.toFixed(2) || '-'}</td>
                      <td className="py-3 px-4 text-white font-mono">${pos.value?.toFixed(2) || pos.marketValue?.toFixed(2) || '-'}</td>
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
                      <td className="py-3 px-4 text-white font-mono">${pos.value?.toFixed(2) || pos.marketValue?.toFixed(2) || '-'}</td>
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
            <p className="text-gray-400 mb-6">Click update to load current positions</p>
            <button
              onClick={loadInitialData}
              disabled={loading}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:from-blue-600 hover:to-purple-700 transition-all duration-200"
            >
              Load Positions
            </button>
          </div>
        )}
      </div>
    </div>
  )
}