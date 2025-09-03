// frontend/src/components/CacheStatus.tsx
import React, { useState, useEffect } from 'react'
import { fetchCacheSummary, fetchLatestCache, clearCache, type CacheSummary, type CacheData } from '../api/cacheService'

interface CacheStatusProps {
  onLoadFromCache: (data: CacheData) => void
  onClearCache: () => void
}

const CacheStatus: React.FC<CacheStatusProps> = ({ onLoadFromCache, onClearCache }) => {
  const [summary, setSummary] = useState<CacheSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadSummary()
  }, [])

  const loadSummary = async () => {
    try {
      const data = await fetchCacheSummary()
      setSummary(data)
    } catch (err) {
      console.error('Cache summary load error:', err)
      setSummary({ hasCache: false })
    }
  }

  const handleLoadFromCache = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const cacheData = await fetchLatestCache()
      if (cacheData) {
        onLoadFromCache(cacheData)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'キャッシュ読み込みエラー')
    } finally {
      setLoading(false)
    }
  }

  const handleClearCache = async () => {
    try {
      await clearCache()
      setSummary({ hasCache: false })
      onClearCache()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'キャッシュ削除エラー')
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ja-JP')
  }

  const getAgeColor = (ageInHours?: number) => {
    if (!ageInHours) return 'text-gray-400'
    if (ageInHours < 1) return 'text-green-400'
    if (ageInHours < 6) return 'text-yellow-400'
    if (ageInHours < 24) return 'text-orange-400'
    return 'text-red-400'
  }

  if (!summary) return null

  return (
    <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-4 mb-6">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-white">Cache Status</h3>
        {summary.hasCache && (
          <button
            onClick={handleClearCache}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-all duration-200"
          >
            Clear Cache
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg mb-3">
          <div className="text-red-300 text-sm">{error}</div>
          <button 
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300 text-xs underline mt-1"
          >
            Close
          </button>
        </div>
      )}

      {!summary.hasCache ? (
        <div className="text-center py-4">
          <div className="text-gray-400 text-sm">No cached data available</div>
          <div className="text-gray-500 text-xs mt-1">Fetch new data to create cache</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
            <div>
              <div className="text-gray-400">Fetch Date</div>
              <div className="text-white font-mono text-xs">
                {formatDate(summary.fetchDate!)}
              </div>
            </div>
            <div>
              <div className="text-gray-400">Age</div>
              <div className={`font-mono ${getAgeColor(summary.ageInHours)}`}>
                {summary.ageInHours! < 1 
                  ? `${Math.round(summary.ageInHours! * 60)}min`
                  : `${summary.ageInHours!.toFixed(1)}h`
                }
              </div>
            </div>
            <div>
              <div className="text-gray-400">Strike Range</div>
              <div className="text-white font-mono text-xs">
                {summary.strikeRange?.min}-{summary.strikeRange?.max} (step {summary.strikeRange?.step})
              </div>
            </div>
            <div>
              <div className="text-gray-400">Data Count</div>
              <div className="text-white font-mono text-xs">
                {summary.totalOptions} options, {summary.totalStrategies} strategies
              </div>
            </div>
          </div>
          
          <div className="flex justify-between items-center">
            <div className="text-xs text-gray-400">
              Expirations: {summary.expirations?.map(exp => 
                `${exp.slice(2,4)}/${exp.slice(4,6)}/${exp.slice(6,8)}`
              ).join(', ')}
            </div>
            <button
              onClick={handleLoadFromCache}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded text-sm font-medium transition-all duration-200"
            >
              {loading ? 'Loading...' : 'Load from Cache'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default CacheStatus