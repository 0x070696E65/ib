import { useState, useEffect } from 'react'
import { formatInTimeZone } from 'date-fns-tz'
import type { OptionClosePrice, FetchSummary } from '../../shared/types'
import { fetchAllVixData, fetchVixExpirations, fetchAllVixDataFromMongo } from './api/vixService'

function App() {
  const [loading, setLoading] = useState(false)
  const [contracts, setContracts] = useState<string[]>([])
  const [contract, setContract] = useState<string>("")
  const [rows, setRows] = useState<OptionClosePrice[]>([])
  const [page, setPage] = useState(1)
  const limit = 20 // 1ページあたりの日付数

  // 🔹 既存：IBから一括取得する関数
  const handleFetchData = async () => {
    setLoading(true)
    try {
      const result: FetchSummary = await fetchAllVixData()
      console.log('一括取得結果:', result)
    } catch (error) {
      console.error('データ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  // 🔹 満期日一覧を取得
  useEffect(() => {
    const fetchContracts = async () => {
      const res = await fetchVixExpirations()
      setContracts(res)
    }
    fetchContracts()
  }, [])

  // 🔹 選択した満期日のデータ取得
  useEffect(() => {
    if (!contract) return
    const fetchData = async () => {
      const res = await fetchAllVixDataFromMongo(contract)
      setRows(res)
      setPage(1)
    }
    fetchData()
  }, [contract])

  // 🔹 データをピボット
  const pivot = () => {
    const strikes = [...new Set(rows.map(r => r.strike))].sort((a, b) => b - a)
    const dates = [...new Set(
      rows.map(r => {
      const dateObj = new Date(r.date);
      return formatInTimeZone(dateObj, 'America/Chicago', 'yy/MM/dd')
    })

    )].sort()

    const table: Record<number, Record<string, number>> = {}
    rows.forEach(r => {
      const d = formatInTimeZone(new Date(r.date), 'America/Chicago', 'yy/MM/dd')
      if (!table[r.strike]) table[r.strike] = {}
      table[r.strike][d] = r.close
    })

    return { strikes, dates, table }
  }

  const { strikes, dates, table } = pivot()

  // 🔹 ページネーション（日付を分割）
  const start = (page - 1) * limit
  const end = start + limit
  const pagedDates = dates.slice(start, end)
  const totalPages = Math.ceil(dates.length / limit)

  return (
    <div className="w-screen min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 overflow-x-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}></div>
      </div>
      
      <div className="relative z-10 p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent mb-2">
            VIX Option Historical Data
          </h1>
          <p className="text-gray-400 text-lg">Advanced options analytics dashboard</p>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8 justify-center items-center">
          <button 
            onClick={handleFetchData}
            disabled={loading}
            className={`group relative px-8 py-3 rounded-xl font-semibold text-white transition-all duration-300 transform hover:scale-105 ${
              loading 
                ? 'bg-gray-600 cursor-not-allowed' 
                : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-lg hover:shadow-blue-500/25'
            }`}
          >
            <span className="relative z-10">
              {loading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  データ取得中...
                </div>
              ) : (
                'VIXオプションデータ取得'
              )}
            </span>
            {!loading && (
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-700 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            )}
          </button>

          <div className="relative">
            <select
              value={contract}
              onChange={(e) => setContract(e.target.value)}
              className="appearance-none bg-white/10 backdrop-blur-sm border border-white/20 text-white px-6 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300 hover:bg-white/20 min-w-[200px]"
            >
              <option value="" className="text-gray-800">-- Select Expiration --</option>
              {Array.isArray(contracts) && contracts.map(c => (
                <option key={c} value={c} className="text-gray-800">
                  {`${c.slice(0,4)}-${c.slice(4,6)}-${c.slice(6,8)}`}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
              <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        {/* Data Table */}
        {contract && (
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/20">
                    <th className="text-left py-4 px-4 text-white font-semibold">
                      Strike
                    </th>
                    {pagedDates.map(d => (
                      <th key={d} className="text-left py-4 px-4 text-white font-semibold whitespace-nowrap">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {strikes.map((s, index) => (
                    <tr 
                      key={s} 
                      className={`border-b border-white/10 hover:bg-white/5 transition-colors duration-200 ${
                        index % 2 === 0 ? 'bg-white/2' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-white font-medium">{s}</td>
                      {pagedDates.map(d => {
                        const value = table[s]?.[d];
                        return (
                          <td key={d} className="py-3 px-4">
                            {value ? (
                              <span className="text-emerald-400 font-mono">
                                {value}
                              </span>
                            ) : (
                              <span className="text-gray-500">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex justify-center items-center space-x-6 mt-8 pt-6 border-t border-white/10">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="flex items-center px-4 py-2 bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:text-gray-500 text-white rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Previous
              </button>
              
              <div className="flex items-center space-x-2">
                <span className="text-white/70">Page</span>
                <span className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-3 py-1 rounded-lg font-semibold">
                  {page}
                </span>
                <span className="text-white/70">of {totalPages}</span>
              </div>
              
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="flex items-center px-4 py-2 bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:text-gray-500 text-white rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
              >
                Next
                <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {!contract && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-xl text-white/70 mb-2">Select an expiration date to view data</h3>
            <p className="text-gray-400">Choose from the dropdown above to get started</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;