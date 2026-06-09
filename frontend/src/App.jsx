import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { getCameras, getStatsTotal, getStatsGrouped, previewDeleteRange, confirmDelete, deleteByRange, getPreviews, openvinoAnalyzeRange, geminiAnalyzeBatch, claudeAnalyzeBatch, getClassesList, createTask, getAiAnalysisInRange } from './api.js'
import DeleteConfirmModal from './components/DeleteConfirmModal.jsx'
import Header from './components/Header.jsx'
import CameraSelector from './components/CameraSelector.jsx'
import DrilldownBreadcrumb from './components/DrilldownBreadcrumb.jsx'
import HeatmapGrid from './components/HeatmapGrid.jsx'
import HourViewer from './components/HourViewer.jsx'
import StatsBar from './components/StatsBar.jsx'
import ScanButton from './components/ScanButton.jsx'
import ToolsButton from './components/ToolsButton.jsx'
import TasksScreen from './components/TasksScreen.jsx'
import TaskResultsModal from './components/TaskResultsModal.jsx'
import TuningScreen from './components/TuningScreen.jsx'
import { initFontSize } from './components/tools/settingsIO.js'
import CellSelBar from './components/CellSelBar.jsx'
import { useHeatmapKeyboard } from './components/useHeatmapKeyboard.js'
import {
  LEVELS, dateRangeForPeriod, computeIntensity, getPreviewsPerCell,
  loadNavState, saveNavState,
} from './components/navUtils.js'
import { CELL_ANALYSIS_PROMPT } from './prompts.js'
import { computeViewedStatusMap, cacheDataHours, cacheDataDays, cacheDataMonths } from './viewedStatus.js'

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
  const [selTaskSent, setSelTaskSent]     = useState(false)
  const [selTaskError, setSelTaskError]   = useState(null)
  const [rangeDeletePreview, setRangeDeletePreview]           = useState(null)
  const [rangeDeletePreviewLoading, setRangeDeletePreviewLoading] = useState(false)
  const [rangeDeleteDeleteLoading, setRangeDeleteDeleteLoading]   = useState(false)
  const [rangeDeleteError, setRangeDeleteError]               = useState(null)
  const rangeDeleteDrillBack = useRef(null)
  const [focusedPeriod, setFocusedPeriod] = useState(null)
  const restorePeriodRef = useRef(null)
  const [showTasks, setShowTasks] = useState(false)
  const [showTuning, setShowTuning] = useState(false)
  const [taskResultsModal, setTaskResultsModal] = useState(null) // {task, results}
  const [viewedRefreshKey, setViewedRefreshKey] = useState(0)

  const currentLevel = LEVELS[Math.min(drillStack.length, LEVELS.length - 1)]

  useEffect(() => { initFontSize() }, [])

  // Sync previewsPerCell from localStorage changes dispatched by ToolsModal
  useEffect(() => {
    function onSettingChange() { setPreviewsPerCell(getPreviewsPerCell()) }
    document.addEventListener('previews-per-cell-change', onSettingChange)
    return () => document.removeEventListener('previews-per-cell-change', onSettingChange)
  }, [])

  // Refresh viewed status whenever an hour is marked viewed in HourViewer
  useEffect(() => {
    function onViewed() { setViewedRefreshKey(k => k + 1) }
    document.addEventListener('hour-viewed-change', onViewed)
    return () => document.removeEventListener('hour-viewed-change', onViewed)
  }, [])

  useEffect(() => {
    setSelMode(false)
    setSelectedPeriods(new Map())
    setSelDelError(null)
    setSelDelConfirm(false)
    setSelAnalyzeError(null)
    setSelTaskSent(false)
    setSelTaskError(null)
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
      .then(data => {
        const computed = computeIntensity(data.periods ?? [])
        setPeriods(computed)
        if (cameraId) {
          const ctx = drillStack[drillStack.length - 1]
          if (currentLevel === 'hour') {
            const dayDate = ctx?.dateFrom?.substring(0, 10)
            if (dayDate) {
              cacheDataHours(cameraId, dayDate,
                computed.filter(p => p.bucket > 0).map(p => p.period.padStart(2, '0')))
            }
          } else if (currentLevel === 'day') {
            const month = ctx?.dateFrom?.substring(0, 7)
            if (month) {
              cacheDataDays(cameraId, month,
                computed.filter(p => p.bucket > 0).map(p => p.period))
            }
          } else if (currentLevel === 'month') {
            const year = ctx?.dateFrom?.substring(0, 4)
            if (year) {
              cacheDataMonths(cameraId, year,
                computed.filter(p => p.bucket > 0).map(p => p.period))
            }
          }
        }
      })
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

  const viewedStatusMap = useMemo(() => {
    if (selectedHour) return new Map()
    const contextDateFrom = drillStack[drillStack.length - 1]?.dateFrom ?? null
    return computeViewedStatusMap(periods, currentLevel, contextDateFrom, cameraId)
  // viewedRefreshKey is intentionally the trigger for recomputing from localStorage
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periods, currentLevel, cameraId, drillStack, viewedRefreshKey])

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
          const videoMode = localStorage.getItem('video_preview_mode') || 'none'
          await openvinoAnalyzeRange({ cameraId, dateFrom, dateTo, modelName: model, confidence, classes: getClassesList(), videoThumbMode: videoMode })
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

  async function handleNavigateFromTask(task) {
    const params = task.params || {}
    const camId = params.camera_id
    if (!camId || !params.date_from || !params.date_to) return
    try {
      const data = await getAiAnalysisInRange(camId, params.date_from, params.date_to, task.type)
      setTaskResultsModal({ task, results: data.results ?? [], stats: data.stats ?? null })
    } catch {
      // fallback: navigate to heatmap
      _navigateToTaskPeriod(task)
    }
  }

  function _navigateToTaskPeriod(task) {
    const params = task.params || {}
    const camId = params.camera_id
    const dateStr = params.date_from
    if (!camId || !dateStr) return
    const year  = dateStr.slice(0, 4)
    const month = dateStr.slice(0, 7)
    const lastDay = new Date(+year, +month.slice(5), 0).getDate()
    setCameraId(camId)
    setDrillStack([
      { level: 'year',  label: year,  dateFrom: `${year}-01-01T00:00:00`,  dateTo: `${year}-12-31T23:59:59` },
      { level: 'month', label: month, dateFrom: `${month}-01T00:00:00`, dateTo: `${month}-${String(lastDay).padStart(2,'0')}T23:59:59` },
    ])
    setSelectedHour(null)
    setShowTasks(false)
    setShowTuning(false)
  }

  function handleNavigateToHour(timestamp) {
    // timestamp: "2024-07-30T17:29:54"
    const date  = timestamp.slice(0, 10)
    const hour  = timestamp.slice(11, 13)
    const year  = date.slice(0, 4)
    const month = date.slice(0, 7)
    const lastDay = new Date(+year, +month.slice(5), 0).getDate()
    const taskCamId = taskResultsModal?.task?.params?.camera_id
    setTaskResultsModal(null)
    if (taskCamId) setCameraId(taskCamId)
    setDrillStack([
      { level: 'year',  label: year,  dateFrom: `${year}-01-01T00:00:00`,  dateTo: `${year}-12-31T23:59:59` },
      { level: 'month', label: month, dateFrom: `${month}-01T00:00:00`, dateTo: `${month}-${String(lastDay).padStart(2,'0')}T23:59:59` },
      { level: 'day',   label: date,  dateFrom: `${date}T00:00:00`,      dateTo: `${date}T23:59:59` },
    ])
    setSelectedHour({ dateFrom: `${date}T${hour}:00:00`, dateTo: `${date}T${hour}:59:59`, label: `${date} ${hour}:00` })
    setShowTasks(false)
    setShowTuning(false)
  }

  async function handleSendCellsToTask(provider, model, confidence) {
    setSelTaskSent(false)
    setSelTaskError(null)
    const apiKey = provider === 'gemini'
      ? localStorage.getItem('gemini_api_key') || ''
      : provider === 'claude'
        ? localStorage.getItem('claude_api_key') || ''
        : null
    if ((provider === 'gemini' || provider === 'claude') && !apiKey) {
      setSelTaskError(`Нет API ключа ${provider === 'gemini' ? 'Gemini' : 'Claude'}`)
      return
    }
    try {
      const cells = [...selectedPeriods.values()]
      for (const cell of cells) {
        const { dateFrom, dateTo } = getCellDateRange(cell.period)
        const typeName = { openvino: 'YOLO', gemini: 'Gemini', claude: 'Claude' }[provider] || provider
        const label = `${typeName} · ${cameraId} · ${dateFrom.slice(0, 10)}`
        const params = { camera_id: cameraId, date_from: dateFrom, date_to: dateTo }
        if (provider === 'openvino') { params.model_name = model; params.confidence = confidence; params.classes = getClassesList() }
        else { params.model = model; params.api_key = apiKey }
        await createTask({ type: provider, params, label })
      }
      setSelTaskSent(true)
    } catch (e) {
      setSelTaskError(e.message)
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
            <button
              className="modal-btn neutral"
              style={{ fontSize: 'calc(var(--font-base) * 0.88)', borderColor: showTuning ? 'var(--accent)' : undefined, color: showTuning ? 'var(--accent)' : undefined }}
              onClick={() => { setShowTuning(v => !v); setShowTasks(false) }}
            >
              <i className="mdi mdi-tune-variant" />
              Tuning
            </button>
            <button
              className="modal-btn neutral"
              style={{ fontSize: 'calc(var(--font-base) * 0.88)', borderColor: showTasks ? 'var(--accent)' : undefined, color: showTasks ? 'var(--accent)' : undefined }}
              onClick={() => { setShowTasks(v => !v); setShowTuning(false) }}
            >
              <i className="mdi mdi-playlist-play" />
              Tasks
            </button>
            <ToolsButton onDatabaseCleared={handleScanComplete} cameraId={cameraId} cameras={cameras} />
            <ScanButton cameraId={cameraId} onScanComplete={handleScanComplete} />
          </div>
        </div>

        {/* Breadcrumb — only in camera view, not in Tuning/Tasks */}
        {!showTasks && !showTuning && (
          <DrilldownBreadcrumb drillStack={drillStack} currentLevel={currentLevel} onNavigate={drillUpTo} extraLabel={selectedHour?.label} />
        )}

        {/* Error banner */}
        {error && (
          <div style={{ background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 'var(--radius)', padding: 'var(--gap-md)', color: '#fca5a5', fontSize: 13 }}>
            <i className="mdi mdi-alert-circle-outline" style={{ marginRight: 6 }} />
            {error}
          </div>
        )}

        {(currentLevel === 'hour' || currentLevel === 'day') && !selectedHour && !showTasks && !showTuning && (
          <>
            {selMode ? (
              <CellSelBar
                level={currentLevel}
                periods={periods}
                selectedMap={selectedPeriods}
                onSelectAll={() => setSelectedPeriods(new Map(periods.filter(p => p.total_size_bytes > 0).map(p => [p.period, p])))}
                onSelectNone={() => setSelectedPeriods(new Map())}
                onClose={() => { setSelMode(false); setSelDelConfirm(false); setSelectedPeriods(new Map()); setSelAnalyzeError(null); setSelTaskSent(false); setSelTaskError(null) }}
                onDelete={handleDeleteHours}
                loading={selDelLoading}
                error={selDelError}
                confirmOpen={selDelConfirm}
                onSetConfirmOpen={setSelDelConfirm}
                onAnalyze={handleAnalyzeCells}
                analyzing={selAnalyzing}
                analyzeProgress={selAnalyzeProgress}
                analyzeError={selAnalyzeError}
                onSendToTask={handleSendCellsToTask}
                taskSent={selTaskSent}
                taskSendError={selTaskError}
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

        {showTuning ? (
          <TuningScreen />
        ) : showTasks ? (
          <TasksScreen cameras={cameras} onNavigate={handleNavigateFromTask} />
        ) : selectedHour ? (
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
              viewedStatusMap={viewedStatusMap}
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

      {taskResultsModal && (
        <TaskResultsModal
          task={taskResultsModal.task}
          results={taskResultsModal.results}
          stats={taskResultsModal.stats}
          onClose={() => setTaskResultsModal(null)}
          onNavigateToHour={handleNavigateToHour}
        />
      )}

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
