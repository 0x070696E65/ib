// frontend/src/pages/PositionsPage.tsx - 拡張版

import { useState, useEffect, useRef } from 'react'
import React from 'react'
import { PositionMonitor, fetchCurrentPositions, controlMonitoring } from '../api/positionService'
import type { Position, PositionStatus } from '../api/positionService'
import { fetchPositionMatching, createBundle, tagPosition, fetchAnalysisData, importFlexData } from '../api/tradeService'
import type { PositionMatchingResult, BundleCreateRequest, TagPositionRequest } from '../types/api'
import type { AnalysisData, TradeOrder } from '../types/trades'

interface AccountPnL {
  dailyPnL: number
  unrealizedPnL: number
  realizedPnL: number
}

interface PositionWithMatch extends Position {
  // マッチング情報
  matched?: boolean
  tradeOrder?: TradeOrder
  positionKey?: string
}

export default function PositionsPage() {
  const [importLoading, setImportLoading] = useState(false)
  const [positions, setPositions] = useState<PositionWithMatch[]>([])
  const [status, setStatus] = useState<PositionStatus | null>(null)
  const [accountPnL, setAccountPnL] = useState<AccountPnL | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pnlErrors, setPnlErrors] = useState<Set<number>>(new Set())
  const [lastUpdate, setLastUpdate] = useState<string | null>(null)
  
  // バンドル・タグ機能用の状態
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set())
  const [showBundleModal, setShowBundleModal] = useState(false)
  const [showTagModal, setShowTagModal] = useState(false)
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(false)
  const [bundleName, setBundleName] = useState('')
  const [selectedTag, setSelectedTag] = useState<'P+' | 'P-'>('P+')
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null)
  const [matchingData, setMatchingData] = useState<PositionMatchingResult | null>(null)
  
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
      
      // ポジションマッチングを実行
      await loadPositionMatching()
    } catch (err) {
      setError('データの読み込みに失敗しました')
      console.error('Initial data load error:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadPositionMatching = async () => {
    try {
      const matchingData = await fetchPositionMatching()
      setMatchingData(matchingData)
      
      // ポジションにマッチング情報を追加
      setPositions(prev => prev.map(pos => {
        const match = matchingData.results.find(result => 
          result.position?.contractId === pos.contractId
        )
        
        if (match && match.matched && match.tradeOrder) {
          return {
            ...pos,
            matched: true,
            tradeOrder: match.tradeOrder,
            positionKey: generatePositionKey(pos)
          }
        }
        
        return { ...pos, matched: false, positionKey: generatePositionKey(pos) }
      }))
    } catch (err) {
      console.error('Position matching error:', err)
    }
  }

  const generatePositionKey = (pos: Position | PositionWithMatch): string => {
    return `${pos.symbol}_${pos.strike}_${pos.expiry}_${pos.optionType}`
  }

  const loadAnalysisData = async () => {
    try {
      const analysisData = await fetchAnalysisData()
      setAnalysisData(analysisData)
    } catch (err) {
      console.error('Analysis data load error:', err)
      setError('分析データの読み込みに失敗しました')
    }
  }

  // FlexImport機能追加
const handleImportFlexData = async () => {
  setImportLoading(true)
  setError(null)
  
  try {
    const result = await importFlexData()
    console.log('FlexQuery import result:', result)
    
    // インポート成功後、データを再読み込み
    if (result.imported > 0) {
      await loadInitialData()
      setError(`インポート完了: ${result.imported}件追加、${result.skipped}件スキップ`)
    } else {
      setError(`新しいデータはありませんでした: ${result.skipped}件スキップ`)
    }
  } catch (err) {
    console.error('Flex import error:', err)
    setError('FlexQueryデータのインポートに失敗しました')
  } finally {
    setImportLoading(false)
  }
}

// 監視ボタン統合機能
const handleToggleMonitoring = async () => {
  try {
    setLoading(true)
    
    if (isMonitoring) {
      await controlMonitoring('stop')
      stopPositionMonitoring()
    } else {
      await controlMonitoring('start')
      startPositionMonitoring()
    }
  } catch (err) {
    console.error(`Monitor control error:`, err)
    setError(`監視${isMonitoring ? '停止' : '開始'}に失敗しました`)
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
    setSelectedPositions(new Set()) // 監視開始時に選択をクリア

    monitor.on('initial', (data: unknown) => {
      const parsedData = data as { positions: Position[]; status: PositionStatus }
      console.log('Initial data received:', parsedData.positions.length)
      setPositions(parsedData.positions.map(pos => ({ ...pos, positionKey: generatePositionKey(pos) })))
      setStatus(parsedData.status)
      setIsConnected(true)
      setLastUpdate(new Date().toLocaleTimeString())

      loadPositionMatching()
    })

    monitor.on('positions', (data: unknown) => {
      const newPositions = data as Position[]
      console.log('Positions updated:', newPositions.length)
      setPositions(newPositions.map(pos => ({ ...pos, positionKey: generatePositionKey(pos) })))
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

  // ポジション選択処理
  const handlePositionSelect = (positionKey: string) => {
    if (isMonitoring) return // 監視中は操作不可

    setSelectedPositions(prev => {
      const newSet = new Set(prev)
      if (newSet.has(positionKey)) {
        newSet.delete(positionKey)
      } else {
        newSet.add(positionKey)
      }
      return newSet
    })
  }

  const handleSelectAll = () => {
    if (isMonitoring) return
    
    const vixPositionKeys = vixPositions
      .filter(pos => pos.matched && pos.positionKey)
      .map(pos => pos.positionKey!)
    
    setSelectedPositions(new Set(vixPositionKeys))
  }

  const handleClearSelection = () => {
    setSelectedPositions(new Set())
  }

  // バンドル作成
  const handleCreateBundle = async () => {
    if (selectedPositions.size < 2) {
      setError('バンドルには2つ以上のポジションが必要です')
      return
    }

    try {
      const request: BundleCreateRequest = {
        name: bundleName,
        positionKeys: Array.from(selectedPositions)
      }

      await createBundle(request)
      setBundleName('')
      setShowBundleModal(false)
      setSelectedPositions(new Set())
      await loadPositionMatching() // データを再読み込み
      setError(null)
    } catch (err) {
      console.error('Bundle creation error:', err)
      setError('バンドルの作成に失敗しました')
    }
  }

  // タグ付け
  const handleTagPosition = async () => {
    if (selectedPositions.size !== 1) {
      setError('タグ付けは1つのポジションのみ選択してください')
      return
    }

    try {
      const positionKey = Array.from(selectedPositions)[0]
      const request: TagPositionRequest = {
        positionKey,
        tag: selectedTag
      }

      await tagPosition(request)
      setShowTagModal(false)
      setSelectedPositions(new Set())
      await loadPositionMatching() // データを再読み込み
      setError(null)
    } catch (err) {
      console.error('Position tagging error:', err)
      setError('タグ付けに失敗しました')
    }
  }

  // バンドル合計P&Lを計算する関数
  const calculateBundlePnL = (bundlePositions: PositionWithMatch[]) => {
    const totalDaily = bundlePositions.reduce((sum, pos) => sum + (pos.dailyPnL || 0), 0)
    const totalUnrealized = bundlePositions.reduce((sum, pos) => sum + (pos.unrealizedPnL || 0), 0)
    return { totalDaily, totalUnrealized }
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
    .sort((a, b) => {
      // 限月順にソート（近い限月から）
      if (!a.expiry && !b.expiry) return 0
      if (!a.expiry) return 1
      if (!b.expiry) return -1
      return new Date(a.expiry).getTime() - new Date(b.expiry).getTime()
    })
  const otherPositions = positions.filter(pos => pos.symbol !== 'VIX')

  // バンドルごとにグループ化
  const bundledPositions = new Map<string, PositionWithMatch[]>()
  const unbundledPositions: PositionWithMatch[] = []

  vixPositions.forEach(pos => {
    const bundleId = pos.tradeOrder?.bundleId
    if (bundleId) {
      if (!bundledPositions.has(bundleId)) {
        bundledPositions.set(bundleId, [])
      }
      bundledPositions.get(bundleId)!.push(pos)
    } else {
      unbundledPositions.push(pos)
    }
  })

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
          <p className="text-gray-400 text-lg">Live position tracking with P&L updates & Trade Analysis</p>
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
                
                {matchingData && (
                  <div className="text-white">
                    マッチ: <span className="text-green-400">{matchingData.matchedPositions}</span>
                    /<span className="text-blue-400">{matchingData.totalPositions}</span>
                  </div>
                )}
                
                {lastUpdate && (
                  <div className="text-gray-400">
                    最終更新: {lastUpdate}
                  </div>
                )}
              </div>

              <div className="flex space-x-3">
  <button
    onClick={handleToggleMonitoring}
    disabled={loading}
    className={`px-4 py-2 ${
      isMonitoring 
        ? 'bg-red-600 hover:bg-red-700' 
        : 'bg-green-600 hover:bg-green-700'
    } disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200 min-w-[100px]`}
  >
    {loading ? '処理中...' : isMonitoring ? '監視停止' : '監視開始'}
  </button>
  
  <button
    onClick={loadInitialData}
    disabled={loading || isMonitoring}
    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200"
  >
    {loading ? '更新中...' : '更新'}
  </button>
  
  <button
    onClick={handleImportFlexData}
    disabled={importLoading || isMonitoring}
    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200 flex items-center space-x-2"
  >
    {importLoading && (
      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
    )}
    <span>{importLoading ? 'インポート中...' : 'Flexインポート'}</span>
  </button>
</div>
            </div>

            {/* Bundle/Tag Control Row */}
            {!isMonitoring && vixPositions.some(pos => pos.matched) && (
              <div className="border-t border-white/10 pt-4">
                <div className="flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0">
                  <div className="flex items-center space-x-4">
                    <span className="text-white">選択済み: {selectedPositions.size}件</span>
                    <button
                      onClick={handleSelectAll}
                      className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm"
                    >
                      全選択
                    </button>
                    <button
                      onClick={handleClearSelection}
                      className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm"
                    >
                      選択解除
                    </button>
                  </div>
                  
                  <div className="flex space-x-3">
                    <button
                      onClick={() => {
                        if (selectedPositions.size < 2) {
                          setError('バンドルには2つ以上のポジションを選択してください')
                          return
                        }
                        setShowBundleModal(true)
                      }}
                      disabled={selectedPositions.size < 2}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg"
                    >
                      バンドル作成
                    </button>
                    <button
                      onClick={() => {
                        if (selectedPositions.size !== 1) {
                          setError('タグ付けは1つのポジションのみ選択してください')
                          return
                        }
                        setShowTagModal(true)
                      }}
                      disabled={selectedPositions.size !== 1}
                      className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg"
                    >
                      タグ付け
                    </button>
                    <button
                      onClick={() => {
                        setShowAnalysisPanel(!showAnalysisPanel)
                        if (!showAnalysisPanel) {
                          loadAnalysisData()
                        }
                      }}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                    >
                      分析表示
                    </button>
                  </div>
                </div>
              </div>
            )}

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

        {/* Analysis Panel */}
        {showAnalysisPanel && analysisData && (
          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">Trade Analysis</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              {/* Summary */}
              <div className="bg-white/10 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-3">総合</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-300">総取引数</span>
                    <span className="text-white font-mono">{analysisData.summary.totalTrades}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">総損益</span>
                    <span className="font-mono">{formatPnL(analysisData.summary.totalPnL)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">勝率</span>
                    <span className="text-white font-mono">{(analysisData.summary.winRate * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              {/* By Tag */}
              <div className="bg-white/10 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-3">タグ別</h3>
                <div className="space-y-2">
                  {Object.entries(analysisData.byTag).map(([tag, data]) => (
                    <div key={tag} className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-purple-300 font-semibold">{tag}</span>
                        <span className="text-gray-300">{data.count}件</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">平均</span>
                        <span className="font-mono">{formatPnL(data.avgPnL)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Bundles */}
              <div className="bg-white/10 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-white mb-3">バンドル</h3>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {analysisData.byBundle.slice(0, 5).map((bundle) => (
                    <div key={bundle.bundleId} className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-green-300 text-sm truncate">{bundle.name}</span>
                        <span className="text-gray-300 text-sm">{bundle.executionCount}件</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400 text-xs">{bundle.status}</span>
                        <span className="font-mono text-sm">{formatPnL(bundle.totalPnL)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIX Positions */}
        {(bundledPositions.size > 0 || unbundledPositions.length > 0) && (
          <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4">VIX Positions</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/20">
                    {!isMonitoring && (
                      <th className="text-left py-3 px-2 text-white font-semibold">選択</th>
                    )}
                    <th className="text-left py-3 px-4 text-white font-semibold">Status</th>
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
                    <th className="text-left py-3 px-4 text-white font-semibold">Tag</th>
                  </tr>
                </thead>
                <tbody>
                  {/* バンドル化されたポジション */}
                  {Array.from(bundledPositions.entries()).map(([bundleId, bundlePositions]) => (
                    <React.Fragment key={bundleId}>
                      {/* バンドルヘッダー */}
                      <tr>
                        <td colSpan={!isMonitoring ? 13 : 12} className="py-2 px-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2 text-sm">
                              <div className="w-4 h-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"></div>
                              <span className="text-purple-300 font-medium">
                                Bundle: {bundlePositions.length} positions
                              </span>
                            </div>
                            <div className="flex items-center space-x-4 text-sm">
                              <span className="text-gray-300">Daily:</span>
                              <span className="font-mono">{formatPnL(calculateBundlePnL(bundlePositions).totalDaily)}</span>
                              <span className="text-gray-300">Unrealized:</span>
                              <span className="font-mono">{formatPnL(calculateBundlePnL(bundlePositions).totalUnrealized)}</span>
                            </div>
                          </div>
                          <div className="mt-1 h-px bg-gradient-to-r from-purple-500/50 to-transparent"></div>
                        </td>
                      </tr>
                      {/* バンドル内のポジション */}
                      {bundlePositions.map((pos, index) => (
                        <tr 
                          key={`bundle-${pos.contractId || pos.localSymbol}`} 
                          className={`border-b border-white/10 hover:bg-white/5 relative ${
                            index === 0 ? 'border-l-4 border-l-purple-500' : 'border-l-4 border-l-purple-500/50'
                          }`}
                          style={{
                            background: index === 0 
                              ? 'linear-gradient(90deg, rgba(147, 51, 234, 0.1) 0%, rgba(147, 51, 234, 0.05) 50%, transparent 100%)'
                              : 'linear-gradient(90deg, rgba(147, 51, 234, 0.05) 0%, rgba(147, 51, 234, 0.02) 50%, transparent 100%)'
                          }}
                        >
                          {!isMonitoring && (
                            <td className="py-3 px-2">
                              {pos.matched && pos.positionKey ? (
                                <input
                                  type="checkbox"
                                  checked={selectedPositions.has(pos.positionKey)}
                                  onChange={() => handlePositionSelect(pos.positionKey!)}
                                  className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                                />
                              ) : (
                                <div className="w-4 h-4"></div>
                              )}
                            </td>
                          )}
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-1">
                              <div className={`w-2 h-2 rounded-full ${pos.matched ? 'bg-green-400' : 'bg-gray-400'}`}></div>
                              <span className="text-xs text-gray-400">
                                {pos.matched ? 'マッチ' : '未マッチ'}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-white font-medium">{pos.symbol}</td>
                          <td className="py-3 px-4 text-white">{pos.strike || '-'}</td>
                          <td className="py-3 px-4 text-white">{pos.optionType || pos.secType}</td>
                          <td className="py-3 px-4 text-white">{pos.expiry ? new Date(pos.expiry).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' }) : '-'}</td>
                          <td className="py-3 px-4 text-white font-mono">{pos.position}</td>
                          <td className="py-3 px-4 text-white font-mono">${pos.avgCost.toFixed(2)}</td>
                          <td className="py-3 px-4 font-mono">{formatPnL(pos.dailyPnL)}</td>
                          <td className="py-3 px-4 font-mono">{formatPnL(pos.unrealizedPnL)}</td>
                          <td className="py-3 px-4 font-mono text-white">${pos.mark?.toFixed(2) || '-'}</td>
                          <td className="py-3 px-4 text-white font-mono">${pos.value?.toFixed(2) || pos.marketValue?.toFixed(2) || '-'}</td>
                          <td className="py-3 px-4">
                            {pos.tradeOrder?.tag ? (
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                pos.tradeOrder.tag === 'PP' ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg' :
                                pos.tradeOrder.tag === 'P+' ? 'bg-green-600 text-white' :
                                'bg-red-600 text-white'
                              }`}>
                                {pos.tradeOrder.tag}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {/* バンドルの区切り */}
                      <tr>
                        <td colSpan={!isMonitoring ? 13 : 12} className="py-2">
                          <div className="h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                  
                  {/* バンドル化されていないポジション */}
                  {unbundledPositions.map((pos) => (
                    <tr key={`unbundled-${pos.contractId || pos.localSymbol}`} className="border-b border-white/10 hover:bg-white/5">
                      {!isMonitoring && (
                        <td className="py-3 px-2">
                          {pos.matched && pos.positionKey ? (
                            <input
                              type="checkbox"
                              checked={selectedPositions.has(pos.positionKey)}
                              onChange={() => handlePositionSelect(pos.positionKey!)}
                              className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                            />
                          ) : (
                            <div className="w-4 h-4"></div>
                          )}
                        </td>
                      )}
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-1">
                          <div className={`w-2 h-2 rounded-full ${pos.matched ? 'bg-green-400' : 'bg-gray-400'}`}></div>
                          <span className="text-xs text-gray-400">
                            {pos.matched ? 'マッチ' : '未マッチ'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-white font-medium">{pos.symbol}</td>
                      <td className="py-3 px-4 text-white">{pos.strike || '-'}</td>
                      <td className="py-3 px-4 text-white">{pos.optionType || pos.secType}</td>
                      <td className="py-3 px-4 text-white">{pos.expiry ? new Date(pos.expiry).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' }) : '-'}</td>
                      <td className="py-3 px-4 text-white font-mono">{pos.position}</td>
                      <td className="py-3 px-4 text-white font-mono">${pos.avgCost.toFixed(2)}</td>
                      <td className="py-3 px-4 font-mono">{formatPnL(pos.dailyPnL)}</td>
                      <td className="py-3 px-4 font-mono">{formatPnL(pos.unrealizedPnL)}</td>
                      <td className="py-3 px-4 font-mono text-white">${pos.mark?.toFixed(2) || '-'}</td>
                      <td className="py-3 px-4 text-white font-mono">${pos.value?.toFixed(2) || pos.marketValue?.toFixed(2) || '-'}</td>
                      <td className="py-3 px-4">
                        {pos.tradeOrder?.tag ? (
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            pos.tradeOrder.tag === 'PP' ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg' :
                            pos.tradeOrder.tag === 'P+' ? 'bg-green-600 text-white' :
                            'bg-red-600 text-white'
                          }`}>
                            {pos.tradeOrder.tag}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
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

      {/* Bundle Modal */}
      {showBundleModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-xl font-semibold text-white mb-4">バンドル作成</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                バンドル名
              </label>
              <input
                type="text"
                value={bundleName}
                onChange={(e) => setBundleName(e.target.value)}
                placeholder="例: PP20250917/20-25"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            
            <div className="mb-6">
              <p className="text-sm text-gray-300">
                選択済み: {selectedPositions.size}件のポジション
              </p>
              <p className="text-xs text-gray-400 mt-1">
                このバンドルには「PP」タグが自動で付与されます
              </p>
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={() => setShowBundleModal(false)}
                className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
              >
                キャンセル
              </button>
              <button
                onClick={handleCreateBundle}
                disabled={!bundleName.trim()}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg"
              >
                作成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tag Modal */}
      {showTagModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-xl font-semibold text-white mb-4">タグ付け</h3>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-3">
                タグを選択
              </label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="tag"
                    value="P+"
                    checked={selectedTag === 'P+'}
                    onChange={(e) => setSelectedTag(e.target.value as 'P+' | 'P-')}
                    className="w-4 h-4 text-green-600 bg-gray-700 border-gray-600 focus:ring-green-500"
                  />
                  <span className="ml-2 text-white">P+ (PUT買い)</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="tag"
                    value="P-"
                    checked={selectedTag === 'P-'}
                    onChange={(e) => setSelectedTag(e.target.value as 'P+' | 'P-')}
                    className="w-4 h-4 text-red-600 bg-gray-700 border-gray-600 focus:ring-red-500"
                  />
                  <span className="ml-2 text-white">P- (PUT売り)</span>
                </label>
              </div>
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={() => setShowTagModal(false)}
                className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
              >
                キャンセル
              </button>
              <button
                onClick={handleTagPosition}
                className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg"
              >
                タグ付け
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}