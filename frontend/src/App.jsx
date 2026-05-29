import { useState, useEffect, useCallback, useRef } from 'react'
import { getCameras, getStatsTotal, getStatsGrouped, previewDeleteRange, confirmDelete, deleteByRange, getPreviews, openvinoAnalyzeRange, geminiAnalyzeBatch, claudeAnalyzeBatch } from './api.js'
import DeleteConfirmModal from './components/DeleteConfirmModal.jsx'
import Header from './components/Header.jsx'
import CameraSelector from './components/CameraSelector.jsx'
import DrilldownBreadcrumb from './components/DrilldownBreadcrumb.jsx'
import HeatmapGrid from './components/HeatmapGrid.jsx'
import HourViewer from './components/HourViewer.jsx'
import StatsBar from './components/StatsBar.jsx'
import ScanButton from './components/ScanButton.jsx'
import ToolsButton from './components/ToolsButton.jsx'
import { initFontSize } from './components/tools/settingsIO.js'
import CellSelBar from './components/CellSelBar.jsx'
import { useHeatmapKeyboard } from './components/useHeatmapKeyboard.js'
import {
  LEVELS, dateRangeForPeriod, computeIntensity, getPreviewsPerCell,
  loadNavState, saveNavState,
} from './components/navUtils.js'
import { CELL_ANALYSIS_PROMPT } from './prompts.js'

const _nav = loadNavState()

function DayDeleteBar({ label, onPreview, loading }) {
  return (
    <button
      className="modal-btn danger-outline"
      style={{ fontSize: 'calc(var(--font-base) * 0.88)' }}
      onClick={onPreview}
      disabled={loading}
    >
      {loading
        ? <i className="mdi mdi-loading mdi-spin" />
        : <><i className="mdi mdi-delete-sweep-outline" /> Delete day {label}</>
      }
    </button>
  )
}

function KeyboardHints({ hints }) {
  if (!hints.length) return null
  return (
    <div style={{
      padding: '4px 16px 6px',
      fontSize: 'calc(var(--font-base) * 0.75)',
      color: 'var(--text-dim)',
      textAlign: 'center',
      userSelect: 'none',
      marginTop: 'var(--gap-md)',
    }}>
      {hints.map((h, i) => (
        <span key={i}>
          {i > 0 && <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>}
          <kbd style={{
            background: '#1f2937', border: '1px solid #374151',
            borderRadius: '3px', padding: '0px 4px', fontSize: 'inherit',
            fontFamily: 'inherit', marginRight: 4,
          }}>{h.key}</kbd>
          {h.label}
        </span>
      ))}
    </div>
  )
}

export default function App() {
  const [cameras, setCameras]           = useState([])
  const [cameraId, setCameraId]         = useState(_nav.cameraId ?? null)
  const [drillStack, setDrillStack]     = useState(_nav.drillStack ?? [])
  const [periods, setPeriods]           = useState([])
  const [totals, setTotals]             = useState(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)
  const [refreshKey, setRefreshKey]     = useState(0)
  const [selectedHour, setSelectedHour] = useState(_nav.selectedHour ?? null)
  const [previewsPerCell, setPreviewsPerCell] = useState(getPreviewsPerCell)
  const [selMode, setSelMode]             = useState(false)
  const [selectedPeriods, setSelectedPeriods] = useState(new Map())
  const [selDelLoading, setSelDelLoading] = useState(false)
  const [selDelError, setSelDelError]     = useState(null)
  const [selDelConfirm, setSelDelConfirm] = useState(false)
  const [aiRefreshKey, setAiRefreshKey]   = useState(0)
  const [selAnalyzing, setSelAnalyzing]   = useState(false)
  const [selAnalyzeError, setSelAnalyzeError] = useState(null)
  const [selAnalyzeProgress, setSelAnalyzeProgress] = useState('')
  const [rangeDeletePreview, setRangeDeletePreview]           = useState(null)
  const [rangeDeletePreviewLoading, setRangeDeletePreviewLoading] = useState(false)
  const [rangeDeleteDeleteLoading, setRangeDeleteDeleteLoading]   = useState(false)
  const [rangeDeleteError, setRangeDeleteError]               = useState(null)
  const rangeDeleteDrillBack = useRef(null)
  const [focusedPeriod, setFocusedPeriod] = useState(null)
  const restorePeriodRef = useRef(null)

  const currentLevel = LEVELS[Math.min(drillStack.length, LEVELS.length - 1)]

  useEffect(() => { initFontSize() }, [])

  // Sync previewsPerCell from localStorage changes dispatched by ToolsModal
  useEffect(() => {
    function onSettingChange() { setPreviewsPerCell(getPreviewsPerCell()) }
    document.addEventListener('previews-per-cell-change', onSettingChange)
    return () => document.removeEventListener('previews-per-cell-change', onSettingChange)
  }, [])

  useEffect(() => {
    setSelMode(false)
    setSelectedPeriods(new Map())
    setSelDelError(null)
    setSelDelConfirm(false)
    setSelAnalyzeError(null)
  }, [drillStack, cameraId])

  useEffect(() => {
    getCameras().then(setCameras).catch(() => {})
  }, [])

  // Auto-select first camera if none selected or saved camera no longer exists
  useEffect(() => {
    if (cameras.length === 0) return
    if (cameraId === null || !cameras.find(c => c.id === cameraId)) {
      setCameraId(cameras[0].id)
      setDrillStack([])
      setSelectedHour(null)
    }
  }, [cameras]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist nav state to localStorage
  useEffect(() => {
    saveNavState({ cameraId, drillStack, selectedHour })
  }, [cameraId, drillStack, selectedHour])

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
      restorePeriodRef.current = cell.period
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

  // Auto-focus: restore cursor to where we drilled from, or fall back to first non-empty cell
  useEffect(() => {
    if (restorePeriodRef.current !== null) {
      setFocusedPeriod(restorePeriodRef.current)
      restorePeriodRef.current = null
    } else {
      setFocusedPeriod(
        periods.find(p => p.total_size_bytes > 0)?.period ?? periods[0]?.period ?? null
      )
    }
  }, [periods])

  // Heatmap keyboard navigation (only active when HourViewer is not open)
  useHeatmapKeyboard({
    selectedHour, periods, focusedPeriod, currentLevel, drillStack, selMode, selectedPeriods,
    setFocusedPeriod, setSelMode, setSelectedPeriods, setDrillStack, setSelDelConfirm,
    restorePeriodRef, drillInto, handleRangeDeletePreview,
  })

  function handleTogglePeriod(cell) {
    setSelectedPeriods(prev => {
      const next = new Map(prev)
      next.has(cell.period) ? next.delete(cell.period) : next.set(cell.period, cell)
      return next
    })
  }

  async function handleDeleteHours() {
    setSelDelLoading(true)
    setSelDelError(null)
    try {
      const dayContext = drillStack[drillStack.length - 1]
      const date = dayContext?.dateFrom?.substring(0, 10)
      for (const [period] of selectedPeriods) {
        const h = period.padStart(2, '0')
        await deleteByRange(cameraId, `${date}T${h}:00:00`, `${date}T${h}:59:59`)
      }
      setSelMode(false)
      setSelDelConfirm(false)
      setSelectedPeriods(new Map())
      handleScanComplete()
    } catch (e) {
      setSelDelError(e.message)
    } finally {
      setSelDelLoading(false)
    }
  }

  function getCellDateRange(period) {
    if (currentLevel === 'hour') {
      const date = drillStack[drillStack.length - 1]?.dateFrom?.substring(0, 10) ?? ''
      const h = period.padStart(2, '0')
      return { dateFrom: `${date}T${h}:00:00`, dateTo: `${date}T${h}:59:59` }
    }
    return dateRangeForPeriod(period, currentLevel)
  }

  async function handleAnalyzeCells(provider, model, confidence) {
    setSelAnalyzing(true)
    setSelAnalyzeError(null)
    setSelAnalyzeProgress('')
    try {
      const cells = [...selectedPeriods.values()]

      if (provider === 'openvino') {
        for (let i = 0; i < cells.length; i++) {
          setSelAnalyzeProgress(`${i + 1}/${cells.length}`)
          const { dateFrom, dateTo } = getCellDateRange(cells[i].period)
          await openvinoAnalyzeRange({ cameraId, dateFrom, dateTo, modelName: model, confidence })
        }
      } else {
        const apiKey = localStorage.getItem(provider === 'gemini' ? 'gemini_api_key' : 'claude_api_key')
        if (!apiKey) throw new Error(`Нет API ключа ${provider === 'gemini' ? 'Gemini' : 'Claude'}. Откройте Tools.`)
        const fileIds = []
        for (const cell of cells) {
          const { dateFrom, dateTo } = getCellDateRange(cell.period)
          const data = await getPreviews(cameraId, dateFrom, dateTo, 1)
          if (data.file_ids?.length) fileIds.push(...data.file_ids)
        }
        if (!fileIds.length) throw new Error('В выбранных ячейках нет фотографий')
        const prompt = CELL_ANALYSIS_PROMPT(fileIds.length)
        if (provider === 'gemini') {
          await geminiAnalyzeBatch({ fileIds, model, apiKey, prompt })
        } else {
          await claudeAnalyzeBatch({ fileIds, model, apiKey, prompt })
        }
      }

      setAiRefreshKey(k => k + 1)
    } catch (e) {
      setSelAnalyzeError(e.message)
    } finally {
      setSelAnalyzing(false)
      setSelAnalyzeProgress('')
    }
  }

  async function handleRangeDeletePreview(dateFrom, dateTo, afterConfirmDrillTo) {
    setRangeDeletePreviewLoading(true)
    setRangeDeleteError(null)
    rangeDeleteDrillBack.current = afterConfirmDrillTo
    try {
      const data = await previewDeleteRange(cameraId, dateFrom, dateTo)
      setRangeDeletePreview(data)
    } catch (e) {
      setRangeDeleteError(e.message)
    } finally {
      setRangeDeletePreviewLoading(false)
    }
  }

  async function handleRangeDeleteConfirm() {
    const allIds = [
      ...rangeDeletePreview.selected.map(f => f.id),
      ...rangeDeletePreview.related_videos.map(f => f.id),
    ]
    setRangeDeleteDeleteLoading(true)
    setRangeDeleteError(null)
    try {
      await confirmDelete(allIds)
      setRangeDeletePreview(null)
      handleScanComplete()
      if (rangeDeleteDrillBack.current !== null) {
        drillUpTo(rangeDeleteDrillBack.current)
        rangeDeleteDrillBack.current = null
      }
    } catch (e) {
      setRangeDeleteError(e.message)
    } finally {
      setRangeDeleteDeleteLoading(false)
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
        <DrilldownBreadcrumb drillStack={drillStack} currentLevel={currentLevel} onNavigate={drillUpTo} extraLabel={selectedHour?.label} />

        {/* Error banner */}
        {error && (
          <div style={{ background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 'var(--radius)', padding: 'var(--gap-md)', color: '#fca5a5', fontSize: 13 }}>
            <i className="mdi mdi-alert-circle-outline" style={{ marginRight: 6 }} />
            {error}
          </div>
        )}

        {(currentLevel === 'hour' || currentLevel === 'day') && !selectedHour && (
          <>
            {selMode ? (
              <CellSelBar
                level={currentLevel}
                periods={periods}
                selectedMap={selectedPeriods}
                onSelectAll={() => setSelectedPeriods(new Map(periods.filter(p => p.total_size_bytes > 0).map(p => [p.period, p])))}
                onSelectNone={() => setSelectedPeriods(new Map())}
                onClose={() => { setSelMode(false); setSelDelConfirm(false); setSelectedPeriods(new Map()); setSelAnalyzeError(null) }}
                onDelete={handleDeleteHours}
                loading={selDelLoading}
                error={selDelError}
                confirmOpen={selDelConfirm}
                onSetConfirmOpen={setSelDelConfirm}
                onAnalyze={handleAnalyzeCells}
                analyzing={selAnalyzing}
                analyzeProgress={selAnalyzeProgress}
                analyzeError={selAnalyzeError}
              />
            ) : (
              <div style={{ display: 'flex', gap: 'var(--gap-sm)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {currentLevel === 'hour' && drillStack.length > 0 && (
                  <DayDeleteBar
                    label={drillStack[drillStack.length - 1].label}
                    onPreview={() => handleRangeDeletePreview(
                      drillStack[drillStack.length - 1].dateFrom,
                      drillStack[drillStack.length - 1].dateTo,
                      drillStack.length - 2,
                    )}
                    loading={rangeDeletePreviewLoading}
                  />
                )}
                <button
                  className="modal-btn neutral"
                  style={{ fontSize: 'calc(var(--font-base) * 0.88)' }}
                  onClick={() => setSelMode(true)}
                >
                  <i className="mdi mdi-checkbox-multiple-marked-outline" />
                  {currentLevel === 'hour' ? ' Select hours' : ' Select days'}
                </button>
              </div>
            )}
          </>
        )}

        {selectedHour ? (
          <HourViewer
            cameraId={cameraId}
            camera={cameras.find(c => c.id === cameraId)}
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
              selectionMode={selMode}
              selectedPeriods={selectedPeriods}
              onTogglePeriod={handleTogglePeriod}
              aiRefreshKey={aiRefreshKey}
              focusedPeriod={focusedPeriod}
            />
            {!loading && periods.length > 0 && (
              <StatsBar periods={periods} level={currentLevel} />
            )}
            {!selectedHour && (
              <KeyboardHints hints={
                selMode
                  ? [
                      { key: '↑ ↓ ← →', label: 'navigate' },
                      { key: 'Space', label: 'toggle' },
                      { key: 'Ctrl+A', label: 'select all' },
                      ...(currentLevel === 'hour' ? [{ key: 'Del', label: 'delete selected' }] : []),
                      { key: 'Esc', label: 'exit selection' },
                    ]
                  : [
                      { key: '↑ ↓ ← →', label: 'navigate' },
                      { key: 'Enter', label: 'open' },
                      ...(drillStack.length > 0 ? [{ key: 'Esc / ⌫', label: 'back' }] : []),
                      ...((currentLevel === 'hour' || currentLevel === 'day') ? [{ key: 'Space', label: 'select' }, { key: 'Ctrl+A', label: 'select all' }] : []),
                      ...(currentLevel === 'hour' ? [{ key: '⌫', label: 'delete day' }] : []),
                    ]
              } />
            )}
          </>
        )}

      </main>

      {rangeDeletePreview && (
        <DeleteConfirmModal
          preview={rangeDeletePreview}
          onConfirm={handleRangeDeleteConfirm}
          onCancel={() => { setRangeDeletePreview(null); setRangeDeleteError(null) }}
          busy={rangeDeleteDeleteLoading}
          error={rangeDeleteError}
          camera={cameras.find(c => c.id === cameraId)}
        />
      )}
    </div>
  )
}
