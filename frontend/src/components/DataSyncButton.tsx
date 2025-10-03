// frontend/src/components/DataSyncButton.tsx
import React, { useState, useEffect } from 'react'
import { importFlexData } from '../api/tradeService'
import { /* fetchAllVixData, fetchAllVixFutureData, */ updateVixExpirations } from '../api/vixService'
import { createPortal } from 'react-dom'

interface FetchProgress {
  expiration: string
  strike: number
  status: 'success' | 'error'
  dataCount?: number
  error?: string
}

interface FetchSummary {
  duration: string
  expirations: number
  totalRequests: number
  successCount: number
  errorCount: number
  message: string
  details: FetchProgress[]
}

interface SyncStatus {
  lastSync: string | null
  status: 'idle' | 'loading' | 'success' | 'error'
  result?: { imported: number; skipped: number } | FetchSummary
  error?: string
}

interface SyncState {
  flexData: SyncStatus
  vixOptions: SyncStatus  
  vixFutures: SyncStatus
}

const DataSyncButton: React.FC = () => {
  const [syncState, setSyncState] = useState<SyncState>({
    flexData: { lastSync: null, status: 'idle' },
    vixOptions: { lastSync: null, status: 'idle' },
    vixFutures: { lastSync: null, status: 'idle' }
  })

  const [isUpdatingExpirations, setIsUpdatingExpirations] = useState(false)
  const [expirationsUpdated, setExpirationsUpdated] = useState(false)
  const [isOverlayVisible, setIsOverlayVisible] = useState(false)

  // Expirations 更新処理
  const handleUpdateExpirations = async () => {
    try {
      setIsUpdatingExpirations(true)
      await updateVixExpirations()
      setExpirationsUpdated(true) // 成功したら同期ボタン解放
    } catch (err) {
      console.error("Failed to update expirations:", err)
      alert("Update failed, please retry")
    } finally {
      setIsUpdatingExpirations(false)
    }
  }

  // localStorage からの状態復元
  useEffect(() => {
    const savedState = localStorage.getItem('dataSyncState')
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState)
        if (parsed && typeof parsed === 'object') {
          setSyncState({
            flexData: parsed.flexData || { lastSync: null, status: 'idle' },
            vixOptions: parsed.vixOptions || { lastSync: null, status: 'idle' },
            vixFutures: parsed.vixFutures || { lastSync: null, status: 'idle' }
          })
        }
      } catch (error) {
        console.error('Failed to parse saved sync state:', error)
      }
    }
  }, [])

  // 今日すでに実行済みかチェック
  const isAlreadySyncedToday = () => {
    const today = new Date().toDateString()
    return Object.values(syncState || {}).every(sync => {
      if (!sync) return false
      const isToday = sync.lastSync && new Date(sync.lastSync).toDateString() === today
      const isSuccess = sync.status === 'success'
      return isToday && isSuccess
    })
  }

  // いずれかが実行中かチェック
  const isAnyLoading = () => {
    return Object.values(syncState).some(sync => sync.status === 'loading')
  }

  // 状態をlocalStorageに保存（個別更新用）
  const updateSyncState = (key: keyof SyncState, updates: Partial<SyncStatus>) => {
    setSyncState(prev => {
      const newState = {
        ...prev,
        [key]: { ...prev[key], ...updates }
      }
      localStorage.setItem('dataSyncState', JSON.stringify(newState))
      return newState
    })
  }

  // 個別API実行関数
  const syncFlexData = async (): Promise<void> => {
  try {
    const result = await importFlexData()
    updateSyncState('flexData', {
      lastSync: new Date().toISOString(),
      status: 'success',
      result,
      error: undefined
    })
  } catch (error) {
    updateSyncState('flexData', {
      lastSync: new Date().toISOString(),
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    throw error
  }
}

  /* const syncVixOptions = async (): Promise<void> => {
  try {
    const result = await fetchAllVixData()
    updateSyncState('vixOptions', {
      lastSync: new Date().toISOString(),
      status: 'success',
      result,
      error: undefined
    })
  } catch (error) {
    updateSyncState('vixOptions', {
      lastSync: new Date().toISOString(),
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    throw error
  }
}

  const syncVixFutures = async (): Promise<void> => {
    try {
      const result = await fetchAllVixFutureData()
      updateSyncState('vixFutures', {
        lastSync: new Date().toISOString(),
        status: 'success',
        result,
        error: undefined
      })
    } catch (error) {
      updateSyncState('vixFutures', {
        lastSync: new Date().toISOString(),
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw error
    }
  } */

  // 全データ同期実行（順次実行に変更）
  const handleSyncAll = async () => {
    // この条件をチェック
    if (isAlreadySyncedToday() || isAnyLoading()) {
      return // 早期リターンで実行を停止
    }

      // FlexDataの開始
    updateSyncState('flexData', { status: 'loading' })
    const flexPromise = syncFlexData().catch(() => {})
    
/*     // VIXOptionsの開始
    updateSyncState('vixOptions', { status: 'loading' })
    await syncVixOptions().catch(() => {})
    
    // VIXFuturesの開始
    updateSyncState('vixFutures', { status: 'loading' })
    await syncVixFutures().catch(() => {}) */
      
    // FlexDataの完了を待つ
    await flexPromise
  }

  const openSyncModal = () => {
    setIsOverlayVisible(true)
  }

  const closeModal = () => {
    setIsOverlayVisible(false)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'loading':
        return <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
      case 'success':
        return <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      case 'error':
        return <div className="w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      default:
        return <div className="w-4 h-4 bg-gray-500 rounded-full"></div>
    }
  }

  const formatResult = (syncData: SyncStatus) => {
    if (!syncData.result) return null
    
    if ('imported' in syncData.result) {
      // Flex Data result
      return `${syncData.result.imported} imported, ${syncData.result.skipped} skipped`
    } else if ('successCount' in syncData.result) {
      // VIX Data result
      const result = syncData.result as FetchSummary
      return `${result.successCount}/${result.totalRequests} success (${result.duration})`
    }
    
    return null
  }

  return (
    <>
      {/* メインボタン */}
      <div className="flex items-center space-x-3">
        <button
            onClick={() => {
              openSyncModal()
            }}
            //disabled={isAlreadySyncedToday() || isAnyLoading()}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center space-x-2 ${
              isAlreadySyncedToday()
                ? 'bg-green-600/20 text-green-400 cursor-not-allowed'
                : isAnyLoading()
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white'
            }`}
          >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>
            {isAlreadySyncedToday() ? 'Synced Today' : isAnyLoading() ? 'Syncing...' : 'Sync Daily Data'}
          </span>
        </button>

        {/* 小さなステータス表示 */}
        <div className="flex items-center space-x-1">
  {getStatusIcon(syncState?.flexData?.status || 'idle')}
  {getStatusIcon(syncState?.vixOptions?.status || 'idle')}
  {getStatusIcon(syncState?.vixFutures?.status || 'idle')}
        </div>
      </div>

      {/* オーバーレイとモーダル */}
      {isOverlayVisible && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-gray-900/90 backdrop-blur-lg rounded-xl border border-white/10 p-6 max-w-lg w-full mx-4">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Daily Data Sync</h3>
              <p className="text-gray-400">Syncing trading data from multiple sources</p>
            </div>

            <div className="space-y-4">
              {/* Flex Data */}
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(syncState.flexData.status)}
                  <span className="text-white">Flex Query Data</span>
                </div>
                <div className="text-right">
                  {syncState.flexData.status === 'success' && (
                    <div className="text-green-400 text-sm">{formatResult(syncState.flexData)}</div>
                  )}
                  {syncState.flexData.status === 'error' && (
                    <div className="text-red-400 text-sm">{syncState.flexData.error}</div>
                  )}
                </div>
              </div>

              {/* VIX Options */}
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(syncState.vixOptions.status)}
                  <span className="text-white">VIX Options Data</span>
                </div>
                <div className="text-right">
                  {syncState.vixOptions.status === 'success' && (
                    <div className="text-green-400 text-sm">{formatResult(syncState.vixOptions)}</div>
                  )}
                  {syncState.vixOptions.status === 'error' && (
                    <div className="text-red-400 text-sm">{syncState.vixOptions.error}</div>
                  )}
                </div>
              </div>

              {/* VIX Futures */}
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(syncState.vixFutures.status)}
                  <span className="text-white">VIX Futures Data</span>
                </div>
                <div className="text-right">
                  {syncState.vixFutures.status === 'success' && (
                    <div className="text-green-400 text-sm">{formatResult(syncState.vixFutures)}</div>
                  )}
                  {syncState.vixFutures.status === 'error' && (
                    <div className="text-red-400 text-sm">{syncState.vixFutures.error}</div>
                  )}
                </div>
              </div>
            </div>

            {/* アクションボタン */}
            <div className="flex justify-end space-x-3 mt-6">
              {!expirationsUpdated && (
                <button
                  onClick={handleUpdateExpirations}
                  disabled={isUpdatingExpirations}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all duration-200"
                >
                  {isUpdatingExpirations ? "Updating..." : "Update Expirations"}
                </button>
              )}

              <button
                onClick={handleSyncAll}
                disabled={isAnyLoading()}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  isAnyLoading()
                    ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                }`}
              >
                {isAnyLoading() ? "Syncing..." : "Sync Daily Data"}
              </button>

              <button
                onClick={closeModal}
                disabled={isAnyLoading()}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-all duration-200"
              >
                Close
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}
    </>
  )
}

export default DataSyncButton