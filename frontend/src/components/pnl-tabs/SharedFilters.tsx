// frontend/src/components/pnl-tabs/SharedFilters.tsx
import React from 'react'

export interface DateRange {
  startDate: string
  endDate: string
}

export interface FilterSettings {
  dateRange: DateRange
  tempDateRange: DateRange
  fillZeroDates: boolean
  symbol: string
}

interface SharedFiltersProps {
  settings: FilterSettings
  onSettingsChange: (settings: Partial<FilterSettings>) => void
  onApplyFilter: () => void
  hasDateChanges: boolean
  loading?: boolean
}

const SharedFilters: React.FC<SharedFiltersProps> = ({
  settings,
  onSettingsChange,
  onApplyFilter,
  hasDateChanges,
  loading = false
}) => {
  const handleTempStartDateChange = (value: string) => {
    onSettingsChange({
      tempDateRange: {
        ...settings.tempDateRange,
        startDate: value
      }
    })
  }

  const handleTempEndDateChange = (value: string) => {
    onSettingsChange({
      tempDateRange: {
        ...settings.tempDateRange,
        endDate: value
      }
    })
  }

  const handleFillZeroDatesChange = (checked: boolean) => {
    onSettingsChange({
      fillZeroDates: checked
    })
  }

  const handleSymbolChange = (value: string) => {
    onSettingsChange({
      symbol: value
    })
  }

  return (
    <div className="bg-white/5 backdrop-blur-lg rounded-xl border border-white/10 p-6 mb-6">
      <h2 className="text-xl font-semibold text-white mb-4">Filters & Settings</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        {/* Start Date */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Start Date</label>
          <input
            type="date"
            value={settings.tempDateRange.startDate}
            onChange={(e) => handleTempStartDateChange(e.target.value)}
            disabled={loading}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* End Date */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">End Date</label>
          <input
            type="date"
            value={settings.tempDateRange.endDate}
            onChange={(e) => handleTempEndDateChange(e.target.value)}
            disabled={loading}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Symbol Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Symbol</label>
          <select
            value={settings.symbol}
            onChange={(e) => handleSymbolChange(e.target.value)}
            disabled={loading}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="VIX">VIX</option>
            {/* 将来的に他のシンボルを追加可能 */}
          </select>
        </div>

        {/* Apply Button */}
        <div className="flex items-end">
          <button
            onClick={onApplyFilter}
            disabled={!hasDateChanges || loading}
            className="w-full px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all duration-200 flex items-center justify-center"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading...
              </>
            ) : (
              'Apply Filter'
            )}
          </button>
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="pt-4 border-t border-white/10">
        <div className="flex flex-wrap gap-6">
          {/* Zero Fill Setting */}
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.fillZeroDates}
              onChange={(e) => handleFillZeroDatesChange(e.target.checked)}
              disabled={loading}
              className="w-4 h-4 text-purple-600 bg-gray-800 border-gray-600 rounded focus:ring-purple-500 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <div>
              <span className="text-sm font-medium text-white">
                Fill zero dates (show continuous timeline)
              </span>
              <p className="text-xs text-gray-400 mt-1">
                When unchecked, only shows dates with actual trades
              </p>
            </div>
          </label>

          {/* Date Range Info */}
          {settings.dateRange.startDate && settings.dateRange.endDate && (
            <div className="text-xs text-gray-400">
              <div className="font-medium text-gray-300 mb-1">Current Range:</div>
              <div>
                {new Date(settings.dateRange.startDate).toLocaleDateString()} - {' '}
                {new Date(settings.dateRange.endDate).toLocaleDateString()}
              </div>
            </div>
          )}
        </div>

        {/* Filter Status */}
        {hasDateChanges && (
          <div className="mt-3 p-2 bg-yellow-500/20 border border-yellow-500/30 rounded-lg">
            <div className="flex items-center space-x-2">
              <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="text-sm text-yellow-300">
                You have unsaved filter changes. Click "Apply Filter" to update the analysis.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SharedFilters