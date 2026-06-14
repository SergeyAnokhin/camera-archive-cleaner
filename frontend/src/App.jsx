import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { getCameras, getStatsTotal, getStatsGrouped, getSettings, saveSettings } from './api.js'
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
import KeyboardHints from './components/KeyboardHints.jsx'
import { initFontSize, collectSettings, applyImportedSettings } from './components/tools/settingsIO.js'
import HelpModal from './components/HelpModal.jsx'
import CellSelBar from './components/CellSelBar.jsx'
import { useHeatmapKeyboard } from './components/useHeatmapKeyboard.js'
import { useCellSelection } from './components/useCellSelection.js'
import { useTaskNavigation } from './components/useTaskNavigation.js'
import { useRangeDelete } from './components/useRangeDelete.js'
import {
  LEVELS, dateRangeForPeriod, computeIntensity, getPreviewsPerCell,
  loadNavState, saveNavState,
} from './components/navUtils.js'
import { computeViewedStatusMap, cacheDataHours, cacheDataDays, cacheDataMonths } from './viewedStatus.js'

const _nav = loadNavState()

function FirstRunNotice({ icon, title, children }) {
  return (
    <div className="heatmap-wrapper">
      <div className="heatmap-empty">
        <i className={`mdi ${icon}`} />
        <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: 'var(--gap-sm)' }}>{title}</div>
        <div style={{ fontSize: 'calc(var(--font-base) * 0.88)', lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  )
}

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
  const [focusedPeriod, setFocusedPeriod] = useState(null)
  const restorePeriodRef = useRef(null)
  const [showTasks, setShowTasks] = useState(false)
  const [showTuning, setShowTuning] = useState(false)
  const [camerasLoaded, setCamerasLoaded] = useState(false)
  const [viewedRefreshKey, setViewedRefreshKey] = useState(0)
  const [showHelp, setShowHelp]         = useState(false)

  // Load settings from server on mount
  useEffect(() => {
    getSettings()
      .then(serverSettings => {
        if (serverSettings && Object.keys(serverSettings).length > 0) {
          applyImportedSettings(serverSettings)
        } else {
          try {
            const currentLocal = collectSettings()
            saveSettings(currentLocal).catch(() => {})
          } catch (e) {
            console.error("Failed to sync initial settings to server:", e)
          }
        }
      })
      .catch(err => console.error("Failed to load settings from server:", err))
  }, [])

  const reloadCameras = useCallback(() => {
    getCameras().then(setCameras).catch(() => {})
  }, [])

  const currentLevel = LEVELS[Math.min(drillStack.length, LEVELS.length - 1)]
  const currentCamera = cameras.find(c => c.id === cameraId)

  const handleScanComplete = useCallback(() => setRefreshKey(k => k + 1), [])

  // Cell selection mode: bulk delete / AI analysis / send-to-task (useCellSelection.js)
  const sel = useCellSelection({ cameraId, drillStack, currentLevel, onFilesDeleted: handleScanComplete })

  // Tasks screen → heatmap/hour navigation (useTaskNavigation.js)
  const taskNav = useTaskNavigation({ setCameraId, setDrillStack, setSelectedHour, setShowTasks, setShowTuning })

  // Date-range delete preview/confirm flow (useRangeDelete.js)
  const rangeDelete = useRangeDelete({ cameraId, onDeleted: handleScanComplete, drillUpTo })

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
    getCameras().then(setCameras).catch(() => {}).finally(() => setCamerasLoaded(true))
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
    selectedHour, periods, focusedPeriod, currentLevel, drillStack,
    selMode: sel.selMode, selectedPeriods: sel.selectedPeriods,
    setFocusedPeriod, setSelMode: sel.setSelMode, setSelectedPeriods: sel.setSelectedPeriods,
    setDrillStack, setSelDelConfirm: sel.setDelConfirm,
    restorePeriodRef, drillInto, handleRangeDeletePreview: rangeDelete.handlePreview,
  })

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header totals={totals} />

      <main className="app-main">

        {/* Toolbar */}
        <div className="app-toolbar">
          <CameraSelector cameras={cameras} selectedId={cameraId} onSelect={id => { setCameraId(id); setDrillStack([]); setSelectedHour(null) }} />
          <div style={{ display: 'flex', gap: 'var(--gap-sm)', flexWrap: 'wrap' }}>

            <button
              className="modal-btn neutral"
              style={{ fontSize: 'calc(var(--font-base) * 0.88)' }}
              onClick={() => setShowHelp(true)}
              title="User guide"
            >
              <i className="mdi mdi-help-circle-outline" />
              <span className="btn-label">Help</span>
            </button>
            <button
              className="modal-btn neutral"
              style={{ fontSize: 'calc(var(--font-base) * 0.88)', borderColor: showTasks ? 'var(--accent)' : undefined, color: showTasks ? 'var(--accent)' : undefined }}
              onClick={() => { setShowTasks(v => !v); setShowTuning(false) }}
            >
              <i className="mdi mdi-playlist-play" />
              <span className="btn-label">Tasks</span>
            </button>
            <ToolsButton onDatabaseCleared={handleScanComplete} onCamerasChanged={reloadCameras} cameraId={cameraId} cameras={cameras} />
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
            {sel.selMode ? (
              <CellSelBar
                level={currentLevel}
                periods={periods}
                selectedMap={sel.selectedPeriods}
                onSelectAll={() => sel.setSelectedPeriods(new Map(periods.filter(p => p.total_size_bytes > 0).map(p => [p.period, p])))}
                onSelectNone={() => sel.setSelectedPeriods(new Map())}
                onClose={sel.closeSelection}
                onDelete={sel.handleDeleteHours}
                loading={sel.delLoading}
                error={sel.delError}
                confirmOpen={sel.delConfirm}
                onSetConfirmOpen={sel.setDelConfirm}
                onAnalyze={sel.handleAnalyzeCells}
                analyzing={sel.analyzing}
                analyzeProgress={sel.analyzeProgress}
                analyzeError={sel.analyzeError}
                onSendToTask={sel.handleSendCellsToTask}
                taskSent={sel.taskSent}
                taskSendError={sel.taskError}
              />
            ) : (
              <div style={{ display: 'flex', gap: 'var(--gap-sm)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <button
                  className="modal-btn neutral"
                  style={{ fontSize: 'calc(var(--font-base) * 0.88)' }}
                  onClick={() => sel.setSelMode(true)}
                >
                  <i className="mdi mdi-checkbox-multiple-marked-outline" />
                  {currentLevel === 'hour' ? ' Select hours' : ' Select days'}
                </button>
                {/* destructive action goes last so it's not the first touch target */}
                {currentLevel === 'hour' && drillStack.length > 0 && (
                  <DayDeleteBar
                    label={drillStack[drillStack.length - 1].label}
                    onPreview={() => rangeDelete.handlePreview(
                      drillStack[drillStack.length - 1].dateFrom,
                      drillStack[drillStack.length - 1].dateTo,
                      drillStack.length - 2,
                    )}
                    loading={rangeDelete.previewLoading}
                  />
                )}
              </div>
            )}
          </>
        )}

        {showTuning ? (
          <TuningScreen />
        ) : showTasks ? (
          <TasksScreen cameras={cameras} onNavigate={taskNav.handleNavigateFromTask} onShowTuning={() => { setShowTuning(true); setShowTasks(false) }} />
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
        ) : camerasLoaded && cameras.length === 0 ? (
          <FirstRunNotice icon="mdi-cctv-off" title="No cameras configured">
            Add cameras in <strong>Tools → Cameras</strong>.
          </FirstRunNotice>
        ) : totals && totals.photo_count === 0 && totals.video_count === 0 && currentCamera?.path_exists === false ? (
          <FirstRunNotice icon="mdi-lan-disconnect" title="Camera folder not found">
            <div style={{ textAlign: 'left', maxWidth: 520, lineHeight: 1.7 }}>
              <p style={{ marginBottom: 'var(--gap-sm)' }}>
                The folder for <strong>{currentCamera?.name}</strong> was not found.
                Update the path in <strong>Tools → Cameras</strong>.
              </p>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>Using Home Assistant?</p>
              <ol style={{ paddingLeft: '1.4em', margin: 0 }}>
                <li>
                  Mount your NAS / NVR share:{' '}
                  <a
                    href="https://my.home-assistant.io/redirect/storage/"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: 'var(--accent)', textDecoration: 'underline' }}
                  >
                    Settings → System → Storage → Add network storage
                  </a>
                  {' '}(type: <em>Samba</em>, usage: <em>media</em>)
                </li>
                <li>
                  In <strong>Tools → Cameras</strong>, click <strong>Browse /media</strong> and select the mounted share as Camera Root
                </li>
                <li>Set this camera&apos;s path to the subfolder inside the mount (e.g. <code>FrontDoor</code>)</li>
              </ol>
            </div>
          </FirstRunNotice>
        ) : totals && totals.photo_count === 0 && totals.video_count === 0 ? (
          <FirstRunNotice icon="mdi-magnify-scan" title="Archive not indexed yet">
            Click <strong>Scan</strong> in the toolbar to index the files of this camera.
          </FirstRunNotice>
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
              selectionMode={sel.selMode}
              selectedPeriods={sel.selectedPeriods}
              onTogglePeriod={sel.handleTogglePeriod}
              aiRefreshKey={sel.aiRefreshKey}
              focusedPeriod={focusedPeriod}
              viewedStatusMap={viewedStatusMap}
            />
            {!loading && periods.length > 0 && (
              <StatsBar periods={periods} level={currentLevel} />
            )}
            {!selectedHour && (
              <KeyboardHints hints={
                sel.selMode
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

      {taskNav.taskResultsModal && (
        <TaskResultsModal
          task={taskNav.taskResultsModal.task}
          results={taskNav.taskResultsModal.results}
          stats={taskNav.taskResultsModal.stats}
          totalCount={taskNav.taskResultsModal.totalCount}
          onClose={() => taskNav.setTaskResultsModal(null)}
          onNavigateToHour={taskNav.handleNavigateToHour}
        />
      )}

      {rangeDelete.preview && (
        <DeleteConfirmModal
          preview={rangeDelete.preview}
          onConfirm={rangeDelete.handleConfirm}
          onCancel={rangeDelete.handleCancel}
          busy={rangeDelete.deleteLoading}
          error={rangeDelete.error}
          camera={cameras.find(c => c.id === cameraId)}
        />
      )}

      {showHelp && (
        <HelpModal onClose={() => setShowHelp(false)} />
      )}
    </div>
  )
}
