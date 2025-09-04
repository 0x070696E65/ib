// frontend/src/App.tsx
import { useState } from 'react'
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navItems = [
    { path: '/positions', label: 'Live Positions' },
    { path: '/options', label: 'Option Matrix' },
    { path: '/historical', label: 'Historical Data' },
    { path: '/pnl', label: 'P&L Analysis' },
  ]

  // モバイルメニュー閉じる
  const closeMobileMenu = () => setMobileMenuOpen(false)

  return (
    <>
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
              <span className="text-white text-xl font-bold hidden sm:block">VIX Trading Platform</span>
              <span className="text-white text-lg font-bold sm:hidden">VIX</span>
            </div>

            {/* デスクトップ: 中央データ同期ボタン */}
            <div className="hidden lg:flex items-center">
              <DataSyncButton />
            </div>

            {/* デスクトップ: 右側ナビゲーションメニュー */}
            <div className="hidden md:flex space-x-1 bg-white/10 rounded-lg p-1">
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

            {/* モバイル: ハンバーガーメニューボタン */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors duration-200"
              aria-label="Toggle mobile menu"
            >
              {mobileMenuOpen ? (
                // X アイコン
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                // ハンバーガーアイコン
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* モバイルメニューオーバーレイ */}
      {mobileMenuOpen && (
        <>
          {/* 背景オーバーレイ */}
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={closeMobileMenu}
          />
          
          {/* モバイルメニュー */}
          <div className="fixed top-0 right-0 h-full w-80 bg-slate-900/95 backdrop-blur-lg border-l border-white/10 z-50 md:hidden transform transition-transform duration-300 ease-in-out">
            <div className="p-6">
              {/* モバイルメニューヘッダー */}
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-white text-lg font-semibold">Menu</h2>
                <button
                  onClick={closeMobileMenu}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors duration-200"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* データ同期ボタン - モバイル用 */}
              <div className="mb-8 lg:hidden">
                <div className="text-white text-sm font-medium mb-3">Data Sync</div>
                <DataSyncButton />
              </div>

              {/* ナビゲーションリンク */}
              <div className="space-y-1">
                <div className="text-white text-sm font-medium mb-3">Navigation</div>
                {navItems.map(({ path, label }) => (
                  <Link
                    key={path}
                    to={path}
                    onClick={closeMobileMenu}
                    className={`block px-4 py-3 rounded-lg font-medium transition-all duration-200 ${
                      currentPath === path
                        ? 'bg-purple-600 text-white'
                        : 'text-white/70 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {label}
                  </Link>
                ))}
              </div>

              {/* モバイルメニューフッター */}
              <div className="absolute bottom-6 left-6 right-6">
                <div className="flex items-center space-x-3 p-4 bg-white/5 rounded-lg">
                  <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-white text-sm font-medium">VIX Trading Platform</div>
                    <div className="text-gray-400 text-xs">Advanced Analytics</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

export default App