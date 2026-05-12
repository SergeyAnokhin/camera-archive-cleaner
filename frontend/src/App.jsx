import { useState, useEffect, useCallback } from 'react'
import { getCameras, getStatsTotal, getStatsGrouped } from './api.js'
import Header from './components/Header.jsx'
import CameraSelector from './components/CameraSelector.jsx'
import DrilldownBreadcrumb from './components/DrilldownBreadcrumb.jsx'
import HeatmapGrid from './components/HeatmapGrid.jsx'
import StatsBar from './components/StatsBar.jsx'
import ScanButton from './components/ScanButton.jsx'
import ToolsButton from './components/ToolsButton.jsx'
import { initFontSize } from './components/ToolsModal.jsx'

const LEVELS = ['year', 'month', 'day', 'hour']

function dateRangeForPeriod(period, level) {
  if (level === 'year') {
    return { dateFrom: `${period}-01-01T00:00:00`, dateTo: `${period}-12-31T23:59:59` }
  }
  if (level === 'month') {
    const [y, m] = period.split('-')
    const lastDay = new Date(+y, +m, 0).getDate()
    return {
      dateFrom: `${period}-01T00:00:00`,
      dateTo: `${period}-${String(lastDay).padStart(2, '0')}T23:59:59`,
    }
  }
  if (level === 'day') {
    return { dateFrom: `${period}T00:00:00`, dateTo: `${period}T23:59:59` }
  }
  return {}
}

function computeIntensity(periods) {
  const max = Math.max(...periods.map(p => p.total_size_bytes), 1)
  return periods.map(p => ({
    ...p,
    bucket: p.total_size_bytes === 0 ? 0 : Math.ceil((p.total_size_bytes / max) * 9),
  }))
}

export default function App() {
  const [cameras, setCameras]       = useState([])
  const [cameraId, setCameraId]     = useState(null)
  const [drillStack, setDrillStack] = useState([])
  const [periods, setPeriods]       = useState([])
  const [totals, setTotals]         = useState(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const currentLevel = LEVELS[Math.min(drillStack.length, LEVELS.length - 1)]

  // Restore persisted font size
  useEffect(() => { initFontSize() }, [])

  // Load cameras once
  useEffect(() => {
    getCameras().then(setCameras).catch(() => {})
  }, [])

  // Load header totals whenever camera selection or refresh changes
  useEffect(() => {
    getStatsTotal(cameraId).then(setTotals).catch(() => setTotals(null))
  }, [cameraId, refreshKey])

  // Load heatmap data whenever drill position, camera, or refresh changes
  useEffect(() => {
    setLoading(true)
    setError(null)
    const top = drillStack[drillStack.length - 1]
    getStatsGrouped(currentLevel, {
      cameraId,
      dateFrom: top?.dateFrom ?? null,
      dateTo:   top?.dateTo   ?? null,
    })
      .then(data => setPeriods(computeIntensity(data.periods ?? [])))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [drillStack, cameraId, currentLevel, refreshKey])

  function drillInto(cell) {
    if (currentLevel === 'hour') return
    const { dateFrom, dateTo } = dateRangeForPeriod(cell.period, currentLevel)
    setDrillStack(prev => [...prev, { level: currentLevel, label: cell.period, dateFrom, dateTo }])
  }

  function drillUpTo(index) {
    setDrillStack(prev => prev.slice(0, index + 1))
  }

  const handleScanComplete = useCallback(() => setRefreshKey(k => k + 1), [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header totals={totals} />

      <main style={{ flex: 1, padding: 'var(--gap-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)', maxWidth: 1200, margin: '0 auto', width: '100%' }}>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--gap-sm)' }}>
          <CameraSelector cameras={cameras} selectedId={cameraId} onSelect={id => { setCameraId(id); setDrillStack([]) }} />
          <div style={{ display: 'flex', gap: 'var(--gap-sm)' }}>
            <ToolsButton onDatabaseCleared={handleScanComplete} />
            <ScanButton cameraId={cameraId} onScanComplete={handleScanComplete} />
          </div>
        </div>

        {/* Breadcrumb */}
        <DrilldownBreadcrumb drillStack={drillStack} currentLevel={currentLevel} onNavigate={drillUpTo} />

        {/* Error banner */}
        {error && (
          <div style={{ background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 'var(--radius)', padding: 'var(--gap-md)', color: '#fca5a5', fontSize: 13 }}>
            <i className="mdi mdi-alert-circle-outline" style={{ marginRight: 6 }} />
            {error}
          </div>
        )}

        {/* Heatmap */}
        <HeatmapGrid periods={periods} level={currentLevel} loading={loading} onDrillInto={drillInto} />

        {/* Bar chart */}
        {!loading && periods.length > 0 && (
          <StatsBar periods={periods} level={currentLevel} />
        )}
      </main>
    </div>
  )
}
