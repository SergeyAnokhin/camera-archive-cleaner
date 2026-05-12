import { useState, useEffect, useCallback } from 'react'
import { getCameras, getStatsTotal, getStatsGrouped, deleteByRange } from './api.js'
import Header from './components/Header.jsx'
import CameraSelector from './components/CameraSelector.jsx'
import DrilldownBreadcrumb from './components/DrilldownBreadcrumb.jsx'
import HeatmapGrid from './components/HeatmapGrid.jsx'
import HourViewer from './components/HourViewer.jsx'
import StatsBar from './components/StatsBar.jsx'
import ScanButton from './components/ScanButton.jsx'
import ToolsButton from './components/ToolsButton.jsx'
import { initFontSize } from './components/ToolsModal.jsx'

const LEVELS = ['year', 'month', 'day', 'hour']
const PREVIEWS_PER_CELL_KEY = 'previews_per_cell'
const PREVIEWS_PER_CELL_DEFAULT = 3

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

function getPreviewsPerCell() {
  return Number(localStorage.getItem(PREVIEWS_PER_CELL_KEY)) || PREVIEWS_PER_CELL_DEFAULT
}

function formatBytes(b) {
  if (!b) return '0 B'
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`
  return `${(b / 1e3).toFixed(0)} KB`
}

function DayDeleteBar({ dayEntry, cameraId, periods, onDeleted, onDrillBack }) {
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const totals = periods.reduce(
    (acc, p) => ({
      photos: acc.photos + (p.photo_count || 0),
      videos: acc.videos + (p.video_count || 0),
      bytes:  acc.bytes  + (p.total_size_bytes || 0),
    }),
    { photos: 0, videos: 0, bytes: 0 }
  )

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      await deleteByRange(cameraId, dayEntry.dateFrom, dayEntry.dateTo)
      onDeleted()
      onDrillBack()
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          className="modal-btn danger-outline"
          style={{ fontSize: 'calc(var(--font-base) * 0.88)' }}
          onClick={() => setOpen(true)}
        >
          <i className="mdi mdi-delete-sweep-outline" /> Delete day {dayEntry.label}
        </button>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      background: '#450a0a', border: '1px solid #7f1d1d',
      borderRadius: 'var(--radius)', padding: '8px 14px',
    }}>
      <i className="mdi mdi-alert-outline" style={{ color: '#f87171' }} />
      <span style={{ color: '#fca5a5', fontSize: 'calc(var(--font-base) * 0.88)', flex: 1 }}>
        Delete all files for <strong>{dayEntry.label}</strong>?
        &ensp;{totals.photos.toLocaleString()} photos · {totals.videos.toLocaleString()} videos · {formatBytes(totals.bytes)}
      </span>
      {error && <span style={{ color: '#fca5a5', fontSize: 'calc(var(--font-base) * 0.82)' }}>{error}</span>}
      <button className="modal-btn danger" disabled={loading} onClick={handleConfirm} style={{ fontSize: 'calc(var(--font-base) * 0.88)' }}>
        {loading ? <i className="mdi mdi-loading mdi-spin" /> : <><i className="mdi mdi-delete-outline" /> Delete</>}
      </button>
      <button className="modal-btn neutral" disabled={loading} onClick={() => { setOpen(false); setError(null) }} style={{ fontSize: 'calc(var(--font-base) * 0.88)' }}>
        Cancel
      </button>
    </div>
  )
}

function HourSelBar({ periods, selectedMap, onSelectAll, onSelectNone, onClose, onDelete, loading, error }) {
  const [confirm, setConfirm] = useState(false)
  const count = selectedMap.size
  const stats = [...selectedMap.values()].reduce(
    (acc, p) => ({
      photos: acc.photos + (p.photo_count || 0),
      videos: acc.videos + (p.video_count || 0),
      bytes:  acc.bytes  + (p.total_size_bytes || 0),
    }),
    { photos: 0, videos: 0, bytes: 0 }
  )

  if (confirm) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        background: '#450a0a', border: '1px solid #7f1d1d',
        borderRadius: 'var(--radius)', padding: '8px 14px',
      }}>
        <i className="mdi mdi-alert-outline" style={{ color: '#f87171' }} />
        <span style={{ color: '#fca5a5', fontSize: 'calc(var(--font-base) * 0.88)', flex: 1 }}>
          Delete {count} {count === 1 ? 'hour' : 'hours'}?
          &ensp;{stats.photos.toLocaleString()} photos · {stats.videos.toLocaleString()} videos · {formatBytes(stats.bytes)}
        </span>
        {error && <span style={{ color: '#fca5a5', fontSize: 'calc(var(--font-base) * 0.82)' }}>{error}</span>}
        <button className="modal-btn danger" disabled={loading} onClick={onDelete} style={{ fontSize: 'calc(var(--font-base) * 0.88)' }}>
          {loading ? <i className="mdi mdi-loading mdi-spin" /> : <><i className="mdi mdi-delete-outline" /> Delete</>}
        </button>
        <button className="modal-btn neutral" disabled={loading} onClick={() => setConfirm(false)} style={{ fontSize: 'calc(var(--font-base) * 0.88)' }}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      padding: '6px 10px', background: 'var(--bg-surface)',
      border: 'var(--border)', borderRadius: 'var(--radius)',
    }}>
      <button className="modal-btn neutral" style={{ fontSize: 'calc(var(--font-base) * 0.88)' }} onClick={onSelectAll}>
        <i className="mdi mdi-select-all" /> All ({periods.filter(p => p.total_size_bytes > 0).length})
      </button>
      <button className="modal-btn neutral" style={{ fontSize: 'calc(var(--font-base) * 0.88)' }} disabled={count === 0} onClick={onSelectNone}>
        <i className="mdi mdi-select-off" /> None
      </button>
      {count > 0 && (
        <span style={{ fontSize: 'calc(var(--font-base) * 0.82)', color: 'var(--accent)', padding: '0 4px' }}>
          {count} {count === 1 ? 'hour' : 'hours'} · {stats.photos.toLocaleString()} photos · {stats.videos.toLocaleString()} videos · {formatBytes(stats.bytes)}
        </span>
      )}
      <div style={{ flex: 1 }} />
      <button
        className="modal-btn danger-outline"
        style={{ fontSize: 'calc(var(--font-base) * 0.88)' }}
        disabled={count === 0}
        onClick={() => setConfirm(true)}
      >
        <i className="mdi mdi-delete-outline" /> Delete selected
      </button>
      <button className="modal-btn neutral" style={{ fontSize: 'calc(var(--font-base) * 0.88)' }} onClick={onClose}>
        <i className="mdi mdi-close" /> Cancel
      </button>
    </div>
  )
}

export default function App() {
  const [cameras, setCameras]           = useState([])
  const [cameraId, setCameraId]         = useState(null)
  const [drillStack, setDrillStack]     = useState([])
  const [periods, setPeriods]           = useState([])
  const [totals, setTotals]             = useState(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)
  const [refreshKey, setRefreshKey]     = useState(0)
  const [selectedHour, setSelectedHour] = useState(null)
  const [previewsPerCell, setPreviewsPerCell] = useState(getPreviewsPerCell)
  const [hourSelMode, setHourSelMode]     = useState(false)
  const [selectedHourPeriods, setSelectedHourPeriods] = useState(new Map())
  const [hourSelLoading, setHourSelLoading] = useState(false)
  const [hourSelError, setHourSelError]   = useState(null)

  const currentLevel = LEVELS[Math.min(drillStack.length, LEVELS.length - 1)]

  useEffect(() => { initFontSize() }, [])

  // Sync previewsPerCell from localStorage changes dispatched by ToolsModal
  useEffect(() => {
    function onSettingChange() { setPreviewsPerCell(getPreviewsPerCell()) }
    document.addEventListener('previews-per-cell-change', onSettingChange)
    return () => document.removeEventListener('previews-per-cell-change', onSettingChange)
  }, [])

  useEffect(() => {
    setHourSelMode(false)
    setSelectedHourPeriods(new Map())
    setHourSelError(null)
  }, [drillStack, cameraId])

  useEffect(() => {
    getCameras().then(setCameras).catch(() => {})
  }, [])

  useEffect(() => {
    getStatsTotal(cameraId).then(setTotals).catch(() => setTotals(null))
  }, [cameraId, refreshKey])

  useEffect(() => {
    if (selectedHour) return
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
  }, [drillStack, cameraId, currentLevel, refreshKey, selectedHour])

  function drillInto(cell) {
    if (currentLevel === 'hour') {
      // Opening HourViewer for this specific hour
      const dayContext = drillStack[drillStack.length - 1]
      const date = dayContext?.dateFrom?.substring(0, 10) ?? cell.period
      const h = cell.period.padStart(2, '0')
      setSelectedHour({
        dateFrom: `${date}T${h}:00:00`,
        dateTo:   `${date}T${h}:59:59`,
        label:    `${date}  ${h}:00`,
      })
      return
    }
    const { dateFrom, dateTo } = dateRangeForPeriod(cell.period, currentLevel)
    setDrillStack(prev => [...prev, { level: currentLevel, label: cell.period, dateFrom, dateTo }])
  }

  function drillUpTo(index) {
    setDrillStack(prev => prev.slice(0, index + 1))
    setSelectedHour(null)
  }

  function handleBackFromHour() {
    setSelectedHour(null)
  }

  const handleScanComplete = useCallback(() => setRefreshKey(k => k + 1), [])

  function handleToggleHourPeriod(cell) {
    setSelectedHourPeriods(prev => {
      const next = new Map(prev)
      next.has(cell.period) ? next.delete(cell.period) : next.set(cell.period, cell)
      return next
    })
  }

  async function handleDeleteHours() {
    setHourSelLoading(true)
    setHourSelError(null)
    try {
      const dayContext = drillStack[drillStack.length - 1]
      const date = dayContext?.dateFrom?.substring(0, 10)
      for (const [period] of selectedHourPeriods) {
        const h = period.padStart(2, '0')
        await deleteByRange(cameraId, `${date}T${h}:00:00`, `${date}T${h}:59:59`)
      }
      setHourSelMode(false)
      setSelectedHourPeriods(new Map())
      handleScanComplete()
    } catch (e) {
      setHourSelError(e.message)
    } finally {
      setHourSelLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header totals={totals} />

      <main style={{ flex: 1, padding: 'var(--gap-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)', maxWidth: 1200, margin: '0 auto', width: '100%' }}>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--gap-sm)' }}>
          <CameraSelector cameras={cameras} selectedId={cameraId} onSelect={id => { setCameraId(id); setDrillStack([]); setSelectedHour(null) }} />
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

        {currentLevel === 'hour' && !selectedHour && drillStack.length > 0 && (
          <>
            {hourSelMode ? (
              <HourSelBar
                periods={periods}
                selectedMap={selectedHourPeriods}
                onSelectAll={() => setSelectedHourPeriods(new Map(periods.filter(p => p.total_size_bytes > 0).map(p => [p.period, p])))}
                onSelectNone={() => setSelectedHourPeriods(new Map())}
                onClose={() => { setHourSelMode(false); setSelectedHourPeriods(new Map()) }}
                onDelete={handleDeleteHours}
                loading={hourSelLoading}
                error={hourSelError}
              />
            ) : (
              <div style={{ display: 'flex', gap: 'var(--gap-sm)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <DayDeleteBar
                  dayEntry={drillStack[drillStack.length - 1]}
                  cameraId={cameraId}
                  periods={periods}
                  onDeleted={handleScanComplete}
                  onDrillBack={() => drillUpTo(drillStack.length - 2)}
                />
                <button
                  className="modal-btn neutral"
                  style={{ fontSize: 'calc(var(--font-base) * 0.88)' }}
                  onClick={() => setHourSelMode(true)}
                >
                  <i className="mdi mdi-checkbox-multiple-marked-outline" /> Select hours
                </button>
              </div>
            )}
          </>
        )}

        {selectedHour ? (
          <HourViewer
            cameraId={cameraId}
            dateFrom={selectedHour.dateFrom}
            dateTo={selectedHour.dateTo}
            label={selectedHour.label}
            onBack={handleBackFromHour}
            onFilesDeleted={handleScanComplete}
          />
        ) : (
          <>
            <HeatmapGrid
              periods={periods}
              level={currentLevel}
              loading={loading}
              onDrillInto={drillInto}
              cameraId={cameraId}
              previewsPerCell={previewsPerCell}
              contextDateFrom={drillStack[drillStack.length - 1]?.dateFrom ?? null}
              selectionMode={hourSelMode}
              selectedPeriods={selectedHourPeriods}
              onTogglePeriod={handleToggleHourPeriod}
            />
            {!loading && periods.length > 0 && (
              <StatsBar periods={periods} level={currentLevel} />
            )}
          </>
        )}
      </main>
    </div>
  )
}
