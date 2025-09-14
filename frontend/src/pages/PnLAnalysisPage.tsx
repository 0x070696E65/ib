// frontend/src/pages/PnLAnalysisPage.tsx
import React, { useState, useEffect, useCallback } from 'react'
import { fetchBasicPnLAnalysis, type PnLAnalysisResult } from '../api/pnlService'
import SharedFilters, { type FilterSettings } from '../components/pnl-tabs/SharedFilters'
import BasicAnalysisTab from '../components/pnl-tabs/BasicAnalysisTab'
import MonthlyAnalysisTab from '../components/pnl-tabs/MonthlyAnalysisTab'
import StrategyAnalysisTab from '../components/pnl-tabs/StrategyAnalysisTab'

type TabId = 'basic' | 'monthly' | 'strategy'

interface TabConfig {
  id: TabId
  label: string
  icon: React.ReactNode
  description: string
}

const PnLAnalysisPage: React.FC = () => {
  // タブ設定
  const tabs: TabConfig[] = [
    {
      id: 'basic',
      label: 'Basic Analysis',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      description: 'Daily P&L tracking and cumulative analysis'
    },
    {
      id: 'monthly',
      label: 'Monthly Analysis',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      description: 'Monthly performance trends and seasonality'
    },
    {
      id: 'strategy',
      label: 'Strategy Analysis',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      ),
      description: 'Tag-based strategy performance comparison'
    }
  ]

  // 状態管理
  const [activeTab, setActiveTab] = useState<TabId>('basic')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // データ状態
  const [basicData, setBasicData] = useState<PnLAnalysisResult | null>(null)
  
  // フィルタ設定
  const [settings, setSettings] = useState<FilterSettings>({
    dateRange: { startDate: '', endDate: '' },
    tempDateRange: { startDate: '', endDate: '' },
    fillZeroDates: true,
    symbol: 'VIX',
    tag: ''
  })

  // 日付変更の検出
  const hasDateChanges = 
    settings.tempDateRange.startDate !== settings.dateRange.startDate || 
    settings.tempDateRange.endDate !== settings.dateRange.endDate

  // 基本データ取得関数
  const fetchBasicData = useCallback(async (
    startDate?: string,
    endDate?: string,
    symbol = 'VIX',
    tag?: string
  ) => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchBasicPnLAnalysis(
        startDate || undefined,
        endDate || undefined,
        symbol,
        tag || undefined
      )
      setBasicData(result)
      
      // フィルタの適用日付を更新
      setSettings(prev => ({
        ...prev,
        dateRange: {
          startDate: startDate || '',
          endDate: endDate || ''
        }
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : '損益分析データの取得に失敗しました')
      console.error('損益分析データ取得エラー:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // 初回データ取得
  useEffect(() => {
    fetchBasicData()
  }, [fetchBasicData])

  // フィルタ設定変更ハンドラ
  const handleSettingsChange = (newSettings: Partial<FilterSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }))
  }

  // フィルタ適用ハンドラ
  const handleApplyFilter = async () => {
    await fetchBasicData(
      settings.tempDateRange.startDate,
      settings.tempDateRange.endDate,
      settings.symbol,
      settings.tag || undefined
    )
  }

  // データリフレッシュ
  const handleRefresh = () => {
    fetchBasicData(
      settings.dateRange.startDate,
      settings.dateRange.endDate,
      settings.symbol
    )
  }

  // タブ切り替えハンドラ
  const handleTabChange = (tabId: TabId) => {
    setActiveTab(tabId)
  }

  if (loading && !basicData) {
    return (
      <div className="w-screen min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-500 mx-auto mb-4"></div>
          <p className="text-xl text-white">Loading P&L analysis...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-screen min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 overflow-x-hidden">
      {/* 背景パターン */}
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent mb-2">
            VIX P&L Analysis
          </h1>
          <p className="text-gray-400 text-lg">Comprehensive trading performance analysis with advanced insights</p>
        </div>

        {/* 共通フィルタ */}
        <SharedFilters
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onApplyFilter={handleApplyFilter}
          hasDateChanges={hasDateChanges}
          loading={loading}
        />

        {/* エラー表示 */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4 mb-6">
            <div className="text-red-300">{error}</div>
            <button 
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-300 text-sm underline mt-1"
            >
              Close
            </button>
          </div>
        )}

        {/* タブナビゲーション */}
        <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 mb-6">
          <div className="flex flex-wrap border-b border-white/10">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center space-x-2 px-6 py-4 font-medium transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'text-purple-400 border-b-2 border-purple-400 bg-white/5'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
          
          {/* タブ説明 */}
          <div className="px-6 py-3">
            <p className="text-sm text-gray-400">
              {tabs.find(tab => tab.id === activeTab)?.description}
            </p>
          </div>
        </div>

        {/* タブコンテンツ */}
        <div className="tab-content">
          {activeTab === 'basic' && basicData && (
            <BasicAnalysisTab
              summary={basicData.summary}
              dailyData={basicData.dailyData}
              fillZeroDates={settings.fillZeroDates}
              startDate={settings.dateRange.startDate || undefined}
              endDate={settings.dateRange.endDate || undefined}
              symbol={settings.symbol}
              tag={settings.tag || undefined}
              loading={loading}
              onRefresh={handleRefresh}
            />
          )}

          {activeTab === 'monthly' && (
            <MonthlyAnalysisTab
              startDate={settings.dateRange.startDate || undefined}
              endDate={settings.dateRange.endDate || undefined}
              symbol={settings.symbol}
              loading={loading}
              onRefresh={handleRefresh}
            />
          )}

          {activeTab === 'strategy' && (
            <StrategyAnalysisTab
              startDate={settings.dateRange.startDate || undefined}
              endDate={settings.dateRange.endDate || undefined}
              symbol={settings.symbol}
              loading={loading}
              onRefresh={handleRefresh}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default PnLAnalysisPage