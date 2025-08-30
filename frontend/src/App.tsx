// frontend/src/App.tsx
import { useState } from 'react'
import HistoricalDataPage from './pages/HistoricalDataPage'
import PositionsPage from './pages/PositionsPage'

type PageType = 'historical' | 'positions'

function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('historical')

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Navigation */}
      <nav className="relative z-50 bg-black/20 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <span className="text-white text-xl font-bold">VIX Trading Platform</span>
            </div>
            
            <div className="flex space-x-1 bg-white/10 rounded-lg p-1">
              <button
                onClick={() => setCurrentPage('historical')}
                className={`px-4 py-2 rounded-md font-medium transition-all duration-200 ${
                  currentPage === 'historical'
                    ? 'bg-white text-gray-900 shadow-lg'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                Historical Data
              </button>
              <button
                onClick={() => setCurrentPage('positions')}
                className={`px-4 py-2 rounded-md font-medium transition-all duration-200 ${
                  currentPage === 'positions'
                    ? 'bg-white text-gray-900 shadow-lg'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                Live Positions
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Page Content */}
      <main>
        {currentPage === 'historical' && <HistoricalDataPage />}
        {currentPage === 'positions' && <PositionsPage />}
      </main>
    </div>
  )
}

export default App