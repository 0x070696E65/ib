import { useState } from 'react'
import { formatInTimeZone } from 'date-fns-tz'
import type { OptionClosePrice } from '../../shared/types'
import { fetchVixOption, /* fetchVixExpirations */ } from './api/vixService'

function App() {
  const [prices, setPrices] = useState<OptionClosePrice[]>([])
  const [expirations, /* setExpirations */] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const handleFetchData = async () => {
    setLoading(true)
    try {
      const data = await fetchVixOption(18, '20250916')
      setPrices(data)
      console.log('データ取得成功:', data.length)
    } catch (error) {
      console.error('データ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-3xl font-bold mb-6 text-center text-gray-800">
        VIX Option Historical Data
      </h1>

      <div className="mb-6 text-center">
        <button 
          onClick={handleFetchData}
          disabled={loading}
          className={`px-6 py-3 rounded-lg font-semibold ${
            loading 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {loading ? 'データ取得中...' : 'VIXオプションデータ取得'}
        </button>
      </div>

      <h2 className="text-xl font-semibold mb-4">Available Expirations</h2>
      <div className="flex gap-2 flex-wrap mb-6">
        {expirations.map((exp) => (
          <span key={exp} className="px-3 py-1 bg-blue-100 rounded-full">{exp}</span>
        ))}
      </div>

      {prices.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {(() => {
            // contract + strike ごとにグループ化
            const grouped: Record<string, OptionClosePrice[]> = {}
            prices.forEach((record) => {
              const key = `${record.contract}_${record.strike}`
              if (!grouped[key]) grouped[key] = []
              grouped[key].push(record)
            })

            return Object.entries(grouped).map(([key, records], idx) => {
              const [contract, strike] = key.split('_')
              
              // 日ごとに最新だけ残す
              const dailyMap = new Map<string, OptionClosePrice>()
              records.forEach((record) => {
                const recordDate = new Date(record.date)
                const dateKey = recordDate.toISOString().slice(0, 10)
                if (!dailyMap.has(dateKey) || recordDate > dailyMap.get(dateKey)!.date) {
                  dailyMap.set(dateKey, { ...record, date: recordDate })
                }
              })
              
              const dailyData = Array.from(dailyMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime())
              return (
                <div key={idx} className="p-5 rounded-xl shadow-lg border bg-white hover:shadow-2xl transition-all">
                  <h2 className="text-lg font-semibold text-gray-700 mb-2">
                    Contract: {contract} | Strike: {strike}
                  </h2>
                  <div className="space-y-1">
                    {dailyData.map((bar, i) => (
                      <div key={i} className={`p-2 rounded-md border ${bar.close >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <p className="text-sm text-gray-500">
                          {formatInTimeZone(bar.date, 'America/Chicago', 'yyyy/MM/dd HH:mm')}
                        </p>
                        <p className="text-base font-medium text-gray-700">
                          Close: {bar.close.toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          })()}
        </div>
      )}
    </div>
  )
}

export default App