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
import { initFontSize } from './components/ToolsModal.jsx'

const CELL_ANALYSIS_PROMPT = (n) =>
  `You are analyzing ${n} photos from a security camera. Return ONLY valid JSON:\n{"scene":"one sentence","images":[{"description":"1-2 sentences","objects":["мужчина","кошка"]}]}\nUse Russian words for people and animals (человек, мужчина, женщина, ребёнок, кошка, собака, птица, машина, велосипед, etc.).`

const LEVELS = ['year', 'month', 'day', 'hour']
const PREVIEWS_PER_CELL_KEY = 'previews_per_cell'
const PREVIEWS_PER_CELL_DEFAULT = 3
const NAV_STATE_KEY = 'nav_state'
const GRID_COLS = { year: 4, month: 4, day: 7, hour: 6 }

function loadNavState() {
  try { return JSON.parse(localStorage.getItem(NAV_STATE_KEY) || 'null') ?? {} } catch { return {} }
}
function saveNavState(s) { localStorage.setItem(NAV_STATE_KEY, JSON.stringify(s)) }

const _nav = loadNavState()

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

const CELL_PROVIDERS = [
  {
    key: 'openvino', label: 'OpenVINO Detection', icon: 'mdi-chip',
    modelKey: 'openvino_model', defaultModel: 'yolov8n',
    models: [
      { value: 'yolov8n', label: '🟢 YOLOv8n — Nano (быстро)' },
      { value: 'yolov8s', label: '🟡 YOLOv8s — Small (точнее)' },
      { value: 'yolov8m', label: '🔴 YOLOv8m — Medium (медленно)' },
    ],
  },
  {
    key: 'gemini', label: 'Gemini Analysis', icon: 'mdi-google',
    modelKey: 'gemini_model', defaultModel: 'gemini-3.1-flash-lite',
    models: [
      { value: 'gemini-3.1-flash-lite',    label: '🟢 gemini-3.1-flash-lite' },
      { value: 'gemini-2.5-flash',         label: '🟡 gemini-2.5-flash' },
      { value: 'gemini-2.5-pro',           label: '🔴 gemini-2.5-pro' },
    ],
  },
  {
    key: 'claude', label: 'Claude Analysis', icon: 'mdi-robot',
    modelKey: 'claude_model', defaultModel: 'claude-haiku-4-5-20251001',
    models: [
      { value: 'claude-haiku-4-5-20251001', label: '🟢 claude-haiku-4-5' },
      { value: 'claude-sonnet-4-6',         label: '🟡 claude-sonnet-4-6' },
      { value: 'claude-opus-4-7',           label: '🔴 claude-opus-4-7' },
    ],
  },
]

function CellSelBar({ level, periods, selectedMap, onSelectAll, onSelectNone, onClose,
                       onDelete, loading, error, confirmOpen, onSetConfirmOpen,
                       onAnalyze, analyzing, analyzeProgress, analyzeError }) {
  const [providerKey, setProviderKey] = useState('openvino')
  const [modelMap, setModelMap] = useState(() => {
    const m = {}
    for (const p of CELL_PROVIDERS) m[p.key] = localStorage.getItem(p.modelKey) || p.defaultModel
    return m
  })
  const [ovConf, setOvConf] = useState(() => {
    try {
      const raw = localStorage.getItem('mode_params_openvino_detection')
      if (raw) return JSON.parse(raw).confidence ?? 25
    } catch {}
    return 25
  })

  const providerCfg = CELL_PROVIDERS.find(p => p.key === providerKey)
  const currentModel = modelMap[providerKey]

  function handleModelChange(val) {
    setModelMap(prev => ({ ...prev, [providerKey]: val }))
    localStorage.setItem(providerCfg.modelKey, val)
  }

  const count = selectedMap.size
  const isHour = level === 'hour'
  const unitLabel = isHour ? 'hour' : 'day'
  const unitLabelPlural = isHour ? 'hours' : 'days'

  const stats = [...selectedMap.values()].reduce(
    (acc, p) => ({
      photos: acc.photos + (p.photo_count || 0),
      videos: acc.videos + (p.video_count || 0),
      bytes:  acc.bytes  + (p.total_size_bytes || 0),
    }),
    { photos: 0, videos: 0, bytes: 0 }
  )

  if (confirmOpen) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        background: '#450a0a', border: '1px solid #7f1d1d',
        borderRadius: 'var(--radius)', padding: '10px 14px',
      }}>
        <i className="mdi mdi-alert-outline" style={{ color: '#f87171' }} />
        <span style={{ color: '#fca5a5', fontSize: 'calc(var(--font-base) * 0.88)', flex: 1 }}>
          Delete {count} {count === 1 ? unitLabel : unitLabelPlural}?
          &ensp;{stats.photos.toLocaleString()} photos · {stats.videos.toLocaleString()} videos · {formatBytes(stats.bytes)}
        </span>
        {error && <span style={{ color: '#fca5a5', fontSize: 'calc(var(--font-base) * 0.82)' }}>{error}</span>}
        <button className="modal-btn danger" disabled={loading} onClick={onDelete}>
          {loading ? <i className="mdi mdi-loading mdi-spin" /> : <><i className="mdi mdi-delete-outline" /> Delete</>}
        </button>
        <button className="modal-btn neutral" disabled={loading} onClick={() => onSetConfirmOpen(false)}>Cancel</button>
      </div>
    )
  }

  // Use explicit hex colors — CSS vars don't resolve inside native <select> dropdowns
  const selStyle = {
    colorScheme: 'dark',
    background: '#1f2937', color: '#f1f5f9',
    border: '1px solid #374151', borderRadius: 6,
    padding: '4px 8px', fontSize: 'calc(var(--font-base) * 0.85)', cursor: 'pointer',
  }
  const dim = { fontSize: 'calc(var(--font-base) * 0.82)', color: '#64748b', whiteSpace: 'nowrap' }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 0,
      background: '#1f2937', border: '1px solid #374151', borderRadius: 'var(--radius)',
      overflow: 'hidden',
    }}>
      {/* Row 1: selection info + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 12px' }}>
        <button className="modal-btn neutral" onClick={onSelectAll}>
          <i className="mdi mdi-select-all" /> All ({periods.filter(p => p.total_size_bytes > 0).length})
        </button>
        <button className="modal-btn neutral" disabled={count === 0} onClick={onSelectNone}>
          <i className="mdi mdi-select-off" /> None
        </button>
        {count > 0 ? (
          <span style={{ fontSize: 'calc(var(--font-base) * 0.85)', color: '#0ea5e9' }}>
            {count} {count === 1 ? unitLabel : unitLabelPlural} · {stats.photos.toLocaleString()} photos · {stats.videos.toLocaleString()} videos · {formatBytes(stats.bytes)}
          </span>
        ) : (
          <span style={dim}>Select {unitLabelPlural} to analyze</span>
        )}
        <div style={{ flex: 1 }} />
        {isHour && (
          <button className="modal-btn danger-outline" disabled={count === 0} onClick={() => onSetConfirmOpen(true)}>
            <i className="mdi mdi-delete-outline" /> Delete selected
          </button>
        )}
        <button className="modal-btn neutral" onClick={onClose}>
          <i className="mdi mdi-close" /> Cancel
        </button>
      </div>

      {/* Row 2: AI analysis panel — styled like HourViewer AiModePanel */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '8px 12px', borderTop: '1px solid #374151',
        background: 'rgba(14,165,233,0.05)',
      }}>
        {/* Provider combobox */}
        <select value={providerKey} onChange={e => setProviderKey(e.target.value)} style={selStyle}>
          {CELL_PROVIDERS.map(p => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>

        {/* Model combobox */}
        <select value={currentModel} onChange={e => handleModelChange(e.target.value)} style={selStyle}>
          {providerCfg.models.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>

        {/* OpenVINO-only: confidence slider */}
        {providerKey === 'openvino' && (
          <>
            <span style={dim}><i className="mdi mdi-tune-variant" /> Threshold: {ovConf}%</span>
            <input type="range" min={10} max={80} step={5} value={ovConf}
              onChange={e => {
                const v = +e.target.value
                setOvConf(v)
                const key = 'mode_params_openvino_detection'
                const existing = (() => { try { return JSON.parse(localStorage.getItem(key) || '{}') } catch { return {} } })()
                localStorage.setItem(key, JSON.stringify({ ...existing, confidence: v }))
              }}
              style={{ width: 90, accentColor: '#0ea5e9', cursor: 'pointer' }}
            />
          </>
        )}

        {/* Analyze button */}
        <button className="modal-btn accent"
          disabled={count === 0 || analyzing}
          onClick={() => onAnalyze(providerKey, currentModel, ovConf / 100)}
          style={{ marginLeft: 4 }}
        >
          {analyzing
            ? <><i className="mdi mdi-loading mdi-spin" /> {analyzeProgress || 'Analyzing...'}</>
            : <><i className="mdi mdi-play-circle-outline" /> Analyze {count > 0 ? `(${count})` : ''}</>}
        </button>

        {analyzeError && (
          <details style={{ fontSize: 'calc(var(--font-base) * 0.82)', color: '#f87171', maxWidth: 600 }}>
            <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
              <i className="mdi mdi-alert-circle-outline" /> Error (click for details)
            </summary>
            <pre style={{ marginTop: 6, padding: '6px 8px', background: '#1a0a0a', borderRadius: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.9em', maxHeight: 200, overflowY: 'auto' }}>
              {analyzeError}
            </pre>
          </details>
        )}
      </div>
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
  useEffect(() => {
    if (selectedHour) return
    function onKey(e) {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'SELECT') return
      const cols = GRID_COLS[currentLevel] ?? 4
      const idx = Math.max(0, periods.findIndex(p => p.period === focusedPeriod))
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        setFocusedPeriod(periods[Math.min(periods.length - 1, idx + 1)]?.period ?? null)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setFocusedPeriod(periods[Math.max(0, idx - 1)]?.period ?? null)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedPeriod(periods[Math.min(periods.length - 1, idx + cols)]?.period ?? null)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedPeriod(periods[Math.max(0, idx - cols)]?.period ?? null)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const cell = periods[idx]
        if (cell) drillInto(cell)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (selMode) {
          setSelMode(false)
          setSelectedPeriods(new Map())
        } else if (drillStack.length > 0) {
          restorePeriodRef.current = drillStack[drillStack.length - 1].label
          setDrillStack(prev => prev.slice(0, -1))
        }
      } else if (e.key === 'Backspace' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        if (currentLevel === 'hour' && drillStack.length > 0 && !selMode) {
          e.preventDefault()
          const dayEntry = drillStack[drillStack.length - 1]
          handleRangeDeletePreview(dayEntry.dateFrom, dayEntry.dateTo, drillStack.length - 2)
        }
      } else if (e.key === ' ' && (currentLevel === 'hour' || currentLevel === 'day')) {
        e.preventDefault()
        const cell = periods[idx]
        if (cell && cell.total_size_bytes > 0) {
          setSelMode(true)
          setSelectedPeriods(prev => {
            const next = new Map(prev)
            next.has(cell.period) ? next.delete(cell.period) : next.set(cell.period, cell)
            return next
          })
        }
      } else if (e.key === 'Delete' && selMode && selectedPeriods.size > 0 && currentLevel === 'hour') {
        e.preventDefault()
        setSelDelConfirm(true)
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'a' && (currentLevel === 'hour' || currentLevel === 'day')) {
        e.preventDefault()
        setSelMode(true)
        setSelectedPeriods(new Map(periods.filter(p => p.total_size_bytes > 0).map(p => [p.period, p])))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedHour, periods, focusedPeriod, currentLevel, drillStack, selMode, selectedPeriods])

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
