// frontend/src/pages/EnhancedPositionsPage.tsx
import React, { useState, useEffect } from 'react'
import type { PositionWithPnL } from '../types/positions'
import type { PositionMatchResult } from '../types/api'

interface PositionWithTag extends PositionWithPnL {
  tag?: 'PP' | 'P+' | 'P-'
  bundleId?: string
  bundleName?: string
  selected?: boolean
}

interface BundleData {
  bundleId: string
  name: string
  totalPnL: number
  executionCount: number
  status: string
}

interface AnalysisData {
  byTag: Record<string, { count: number; totalPnL: number; avgPnL: number }>
  byBundle: BundleData[]
  summary: { totalTrades: number; totalPnL: number; winRate: number }
}

export default function EnhancedPositionsPage() {
  const [positions, setPositions] = useState<PositionWithTag[]>([])
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set())
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [bundleName, setBundleName] = useState('')
  const [showBundleModal, setShowBundleModal] = useState(false)
  const [showTagModal, setShowTagModal] = useState(false)
  const [selectedTag, setSelectedTag] = useState<'P+' | 'P-'>('P-')
  const [tagTargetPosition, setTagTargetPosition] = useState<string>('')
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const initializeMonitoring = async () => {
      await startPositionMonitoring()
      await loadAnalysisData()
    }
    
    initializeMonitoring()
    
    return () => {
      // クリーンアップ関数は同期的である必要がある
      void stopPositionMonitoring()
    }
  }, [])

  const startPositionMonitoring = async (): Promise<void> => {
    try {
      const response = await fetch('/api/positions/start-monitoring', { method: 'POST' })
      if (response.ok) {
        setIsMonitoring(true)
        pollPositions()
      }
    } catch (error) {
      console.error('監視開始エラー:', error)
    }
  }

  const stopPositionMonitoring = async (): Promise<void> => {
    try {
      await fetch('/api/positions/stop-monitoring', { method: 'POST' })
      setIsMonitoring(false)
    } catch (error) {
      console.error('監視停止エラー:', error)
    }
  }

  const pollPositions = (): void => {
    const interval = setInterval(async () => {
      if (!isMonitoring) {
        clearInterval(interval)
        return
      }

      try {
        const response = await fetch('/api/trades/position-matching')
        const data = await response.json()
        
        if (data.success) {
          const enhancedPositions = data.data.results.map((result: PositionMatchResult) => {
            const position = result.position
            const execution = result.tradeExecution
            
            return {
              ...position,
              tag: execution?.tag,
              bundleId: execution?.bundleId,
              selected: selectedPositions.has(generatePositionKey(position))
            }
          })
          
          setPositions(enhancedPositions)
        }
      } catch (error) {
        console.error('ポジション取得エラー:', error)
      }
    }, 3000)
  }

  const loadAnalysisData = async (): Promise<void> => {
    try {
      const response = await fetch('/api/trades/analysis')
      const data = await response.json()
      if (data.success) {
        setAnalysisData(data.data)
      }
    } catch (error) {
      console.error('分析データ取得エラー:', error)
    }
  }

  const importFlexData = async (): Promise<void> => {
    setLoading(true)
    try {
      const response = await fetch('/api/trades/import-flex-data', { method: 'POST' })
      const data = await response.json()
      
      if (data.success) {
        alert(data.message)
        await loadAnalysisData()
      } else {
        alert(`エラー: ${data.message}`)
      }
    } catch (error) {
      console.error('データインポートエラー:', error)
      alert('データインポートに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const togglePositionSelection = (positionKey: string): void => {
    if (isMonitoring) {
      alert('監視中はバンドル操作はできません。監視を停止してください。')
      return
    }

    const newSelected = new Set(selectedPositions)
    if (newSelected.has(positionKey)) {
      newSelected.delete(positionKey)
    } else {
      newSelected.add(positionKey)
    }
    setSelectedPositions(newSelected)
  }

  const createBundle = async (): Promise<void> => {
    if (selectedPositions.size < 2) {
      alert('バンドルには最低2つのポジションを選択してください')
      return
    }

    try {
      const response = await fetch('/api/trades/bundles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: bundleName,
          positionKeys: Array.from(selectedPositions)
        })
      })

      const data = await response.json()
      if (data.success) {
        alert(`バンドル "${bundleName}" を作成しました`)
        setShowBundleModal(false)
        setBundleName('')
        setSelectedPositions(new Set())
        await loadAnalysisData()
      } else {
        alert(`エラー: ${data.message}`)
      }
    } catch (error) {
      console.error('バンドル作成エラー:', error)
      alert('バンドル作成に失敗しました')
    }
  }

  const tagPosition = async (): Promise<void> => {
    try {
      const response = await fetch('/api/trades/tag-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positionKey: tagTargetPosition,
          tag: selectedTag
        })
      })

      const data = await response.json()
      if (data.success) {
        alert(`ポジションに ${selectedTag} タグを設定しました`)
        setShowTagModal(false)
        await loadAnalysisData()
      } else {
        alert(`エラー: ${data.message}`)
      }
    } catch (error) {
      console.error('タグ付けエラー:', error)
      alert('タグ付けに失敗しました')
    }
  }

  const generatePositionKey = (position?: PositionWithPnL): string => {
    if (!position) return ''
    return `${position.symbol}_${position.strike}_${position.expiry}_${position.optionType}`
  }

  const getTagColor = (tag?: string): string => {
    switch (tag) {
      case 'PP': return 'bg-blue-100 text-blue-800'
      case 'P+': return 'bg-green-100 text-green-800' 
      case 'P-': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">拡張ポジション管理</h1>
        
        {/* コントロールパネル */}
        <div className="flex gap-4 mb-4">
          <button
            onClick={isMonitoring ? stopPositionMonitoring : startPositionMonitoring}
            className={`px-4 py-2 rounded ${
              isMonitoring 
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            {isMonitoring ? '監視停止' : '監視開始'}
          </button>

          <button
            onClick={importFlexData}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {loading ? 'インポート中...' : 'Flex データ更新'}
          </button>

          <button
            onClick={() => setShowBundleModal(true)}
            disabled={isMonitoring || selectedPositions.size < 2}
            className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded disabled:opacity-50"
          >
            バンドル作成 ({selectedPositions.size})
          </button>
        </div>

        {/* 監視状態表示 */}
        <div className="mb-4">
          <span className={`inline-block px-3 py-1 rounded-full text-sm ${
            isMonitoring ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
          }`}>
            {isMonitoring ? '🟢 リアルタイム監視中' : '🔴 監視停止中'}
          </span>
          {isMonitoring && (
            <span className="ml-2 text-sm text-gray-600">
              ※監視中はバンドル操作が制限されます
            </span>
          )}
        </div>
      </div>

      {/* ポジション一覧 */}
      <div className="bg-white shadow rounded-lg mb-6">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">現在のポジション ({positions.length}件)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">選択</th>
                <th className="px-6 py-3 text-left">銘柄</th>
                <th className="px-6 py-3 text-left">タイプ</th>
                <th className="px-6 py-3 text-left">ストライク</th>
                <th className="px-6 py-3 text-left">満期</th>
                <th className="px-6 py-3 text-left">ポジション</th>
                <th className="px-6 py-3 text-left">未実現損益</th>
                <th className="px-6 py-3 text-left">タグ</th>
                <th className="px-6 py-3 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((position, index) => {
                const positionKey = generatePositionKey(position)
                return (
                  <tr key={index} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedPositions.has(positionKey)}
                        onChange={() => togglePositionSelection(positionKey)}
                        disabled={isMonitoring || position.tag === 'PP'}
                        className="rounded"
                      />
                    </td>
                    <td className="px-6 py-4 font-mono">{position.symbol}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs ${
                        position.optionType === 'PUT' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {position.optionType}
                      </span>
                    </td>
                    <td className="px-6 py-4">{position.strike}</td>
                    <td className="px-6 py-4">{position.expiry}</td>
                    <td className="px-6 py-4">
                      <span className={position.position > 0 ? 'text-green-600' : 'text-red-600'}>
                        {position.position > 0 ? '+' : ''}{position.position}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={
                        (position.unrealizedPnL || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                      }>
                        ${(position.unrealizedPnL || 0).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {position.tag ? (
                        <span className={`px-2 py-1 rounded text-xs ${getTagColor(position.tag)}`}>
                          {position.tag}
                        </span>
                      ) : (
                        <span className="text-gray-400">未タグ</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {!position.tag && (
                        <button
                          onClick={() => {
                            setTagTargetPosition(positionKey)
                            setShowTagModal(true)
                          }}
                          disabled={isMonitoring}
                          className="text-blue-600 hover:text-blue-800 disabled:opacity-50"
                        >
                          タグ付け
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 分析データ */}
      {analysisData && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* タグ別分析 */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">タグ別損益（クローズ済み）</h2>
            </div>
            <div className="p-6">
              {Object.entries(analysisData.byTag).map(([tag, data]) => (
                <div key={tag} className="mb-4">
                  <div className="flex justify-between items-center">
                    <span className={`px-2 py-1 rounded text-sm ${getTagColor(tag)}`}>
                      {tag}
                    </span>
                    <span className={data.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}>
                      ${data.totalPnL.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {data.count}取引 • 平均 ${data.avgPnL.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 全体サマリー */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">全体サマリー</h2>
            </div>
            <div className="p-6">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>総取引数:</span>
                  <span className="font-semibold">{analysisData.summary.totalTrades}</span>
                </div>
                <div className="flex justify-between">
                  <span>総損益:</span>
                  <span className={`font-semibold ${
                    analysisData.summary.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    ${analysisData.summary.totalPnL.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>勝率:</span>
                  <span className="font-semibold">{analysisData.summary.winRate.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* バンドル作成モーダル */}
      {showBundleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">バンドル作成</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">バンドル名</label>
              <input
                type="text"
                value={bundleName}
                onChange={(e) => setBundleName(e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="例: 2025年9月VIXスプレッド"
              />
            </div>
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                選択中のポジション: {selectedPositions.size}件
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={createBundle}
                disabled={!bundleName.trim()}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
              >
                作成
              </button>
              <button
                onClick={() => setShowBundleModal(false)}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded px-4 py-2"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* タグ付けモーダル */}
      {showTagModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">ポジションタグ付け</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">タグ選択</label>
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value as 'P+' | 'P-')}
                className="w-full border rounded px-3 py-2"
              >
                <option value="P-">P- (PUTの売り)</option>
                <option value="P+">P+ (PUTの買い)</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button
                onClick={tagPosition}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white rounded px-4 py-2"
              >
                タグ付け
              </button>
              <button
                onClick={() => setShowTagModal(false)}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded px-4 py-2"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}