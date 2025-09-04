// frontend/src/App.tsx
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import HistoricalDataPage from './pages/HistoricalDataPage'
import PositionsPage from './pages/PositionsPage'
import OptionMatrixPage from './pages/OptionMatrixPage'
import PnLAnalysisPage from './pages/PnLAnalysisPage'
import DataSyncButton from './components/DataSyncButton'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <Navigation />
        <main>
          <Routes>
            <Route path="/positions" element={<PositionsPage />} />
            <Route path="/options" element={<OptionMatrixPage />} />
            <Route path="/historical" element={<HistoricalDataPage />} />
            <Route path="/pnl" element={<PnLAnalysisPage />} />
            {/* デフォルト（/ にアクセスしたとき）は positions にリダイレクト */}
            <Route path="*" element={<PositionsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

function Navigation() {
  const location = useLocation()
  const currentPath = location.pathname

  const navItems = [
    { path: '/positions', label: 'Live Positions' },
    { path: '/options', label: 'Option Matrix' },
    { path: '/historical', label: 'Historical Data' },
    { path: '/pnl', label: 'P&L Analysis' },
  ]

  return (
    <nav className="relative z-50 bg-black/20 backdrop-blur-sm border-b border-white/10">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* 左側: ロゴとタイトル */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <span className="text-white text-xl font-bold">VIX Trading Platform</span>
          </div>

          {/* 中央: データ同期ボタン */}
          <div className="flex items-center">
            <DataSyncButton />
          </div>

          {/* 右側: ナビゲーションメニュー */}
          <div className="flex space-x-1 bg-white/10 rounded-lg p-1">
            {navItems.map(({ path, label }) => (
              <Link
                key={path}
                to={path}
                className={`px-4 py-2 rounded-md font-medium transition-all duration-200 ${
                  currentPath === path
                    ? 'bg-purple-600 text-white'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  )
}

export default App