import { useState, useEffect, useRef, useCallback } from 'react'
import SliderSetting from './SliderSetting.jsx'
import {
  ETA_WINDOW_KEY, ETA_WINDOW_MIN, ETA_WINDOW_MAX, ETA_WINDOW_DEFAULT,
  LOG_TAIL_KEY, LOG_TAIL_MIN, LOG_TAIL_MAX, LOG_TAIL_DEFAULT,
} from './settingsConfig.js'
import {
  clearDatabase, clearAllThumbnails, clearThumbnails,
  clearDiffThumbnails, clearErosionThumbnails,
  clearVideoThumbnails, clearOpenVinoThumbnails,
  vacuumDatabase, getStorageInfo, getCameraDateRange,
} from '../../api.js'

// ═══════════════════════════════════════════════════════════════════════
// Tasks settings section (formerly TasksTab)
// ═══════════════════════════════════════════════════════════════════════
function TasksSection() {
  const [etaWindow, setEtaWindow] = useState(() =>
    Number(localStorage.getItem(ETA_WINDOW_KEY)) || ETA_WINDOW_DEFAULT
  )
  const [logTailLines, setLogTailLines] = useState(() =>
    Number(localStorage.getItem(LOG_TAIL_KEY)) || LOG_TAIL_DEFAULT
  )

  function handleEtaWindowChange(e) {
    const v = Number(e.target.value)
    setEtaWindow(v)
    localStorage.setItem(ETA_WINDOW_KEY, v)
  }

  function handleLogTailChange(e) {
    const v = Number(e.target.value)
    setLogTailLines(v)
    localStorage.setItem(LOG_TAIL_KEY, v)
  }

  return (
    <>
      <SliderSetting
        title="ETA window (minutes)"
        min={ETA_WINDOW_MIN} max={ETA_WINDOW_MAX} step={1}
        value={etaWindow} onChange={handleEtaWindowChange}
        minLabel={String(ETA_WINDOW_MIN)} maxLabel={String(ETA_WINDOW_MAX)}
        valueLabel={`${etaWindow} min`}
        hint="Processing speed and ETA are computed over the last N minutes, not since the task started."
      />

      <SliderSetting
        title="Task log lines"
        min={LOG_TAIL_MIN} max={LOG_TAIL_MAX} step={5}
        value={logTailLines} onChange={handleLogTailChange}
        minLabel={String(LOG_TAIL_MIN)} maxLabel={String(LOG_TAIL_MAX)}
        valueLabel={`${logTailLines} lines`}
        hint="How many trailing lines to show in the log viewer. Reduce if the browser freezes when opening it."
      />
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Logging section (formerly LoggingTab)
// ═══════════════════════════════════════════════════════════════════════
const LOG_LEVELS = [
  { value: 'TRACE',   label: 'TRACE',   hint: 'Thumbnail + polling requests' },
  { value: 'DEBUG',   label: 'DEBUG',   hint: 'All HTTP requests' },
  { value: 'INFO',    label: 'INFO',    hint: 'Operational logs (recommended)' },
  { value: 'WARNING', label: 'WARNING', hint: 'Warnings only' },
  { value: 'ERROR',   label: 'ERROR',   hint: 'Errors only' },
]

function LevelPicker({ value, onChange, disabled }) {
  return (
    <div className="log-level-group">
      {LOG_LEVELS.map(l => (
        <button
          key={l.value}
          title={l.hint}
          disabled={disabled}
          className={`log-level-btn log-level-${l.value.toLowerCase()}${value === l.value ? ' active' : ''}`}
          onClick={() => onChange(l.value)}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}

function getLineClass(line) {
  if (/\s+ERROR\s+/.test(line))   return 'log-line-error'
  if (/\s+WARNING\s+/.test(line)) return 'log-line-warning'
  if (/\s+INFO\s+/.test(line))    return 'log-line-info'
  if (/\s+DEBUG\s+/.test(line))   return 'log-line-debug'
  return 'log-line-trace'
}

function LoggingSection() {
  const [backendLevel,    setBackendLevel]    = useState('INFO')
  const [backendMaxLines, setBackendMaxLines] = useState(500)
  const [computeLevel,    setComputeLevel]    = useState(null)
  const [computeMaxLines, setComputeMaxLines] = useState(200)

  const [logSource,   setLogSource]   = useState('backend')
  const [logLines,    setLogLines]    = useState([])
  const [logN,        setLogN]        = useState(200)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [logError,    setLogError]    = useState(null)

  const logViewerRef = useRef(null)
  const autoScrollRef = useRef(true)

  useEffect(() => {
    fetch('/api/logging/config')
      .then(r => r.json())
      .then(d => { setBackendLevel(d.level || 'INFO'); setBackendMaxLines(d.file_max_lines || 500) })
      .catch(() => {})

    fetch('/api/logging/compute/config')
      .then(r => r.json())
      .then(d => {
        if (d.error) return
        setComputeLevel(d.level || 'INFO')
        setComputeMaxLines(d.file_max_lines || 200)
      })
      .catch(() => {})
  }, [])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setLogError(null)
    const endpoint = logSource === 'compute' ? '/api/logging/compute/tail' : '/api/logging/tail'
    try {
      const r = await fetch(`${endpoint}?n=${logN}`)
      const d = await r.json()
      if (d.error && d.lines?.length === 0) {
        setLogError(d.error)
        setLogLines([])
      } else {
        setLogLines(d.lines || [])
      }
    } catch (e) {
      setLogError(String(e))
    } finally {
      setLoading(false)
    }
  }, [logSource, logN])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(fetchLogs, 3000)
    return () => clearInterval(id)
  }, [autoRefresh, fetchLogs])

  useEffect(() => {
    if (autoScrollRef.current && logViewerRef.current) {
      logViewerRef.current.scrollTop = logViewerRef.current.scrollHeight
    }
  }, [logLines])

  function applyBackendConfig(level, maxLines) {
    fetch('/api/logging/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, file_max_lines: maxLines }),
    }).catch(() => {})
  }

  function applyComputeConfig(level, maxLines) {
    fetch('/api/logging/compute/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, file_max_lines: maxLines }),
    }).catch(() => {})
  }

  function handleBackendLevel(level) {
    setBackendLevel(level)
    applyBackendConfig(level, backendMaxLines)
  }

  function handleBackendMaxLines(e) {
    const v = Number(e.target.value)
    setBackendMaxLines(v)
    applyBackendConfig(backendLevel, v)
  }

  function handleComputeLevel(level) {
    setComputeLevel(level)
    applyComputeConfig(level, computeMaxLines)
  }

  function handleComputeMaxLines(e) {
    const v = Number(e.target.value)
    setComputeMaxLines(v)
    applyComputeConfig(computeLevel || 'INFO', v)
  }

  function handleLogViewerScroll() {
    const el = logViewerRef.current
    if (!el) return
    autoScrollRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 30
  }

  const levelHint = LOG_LEVELS.find(l => l.value === backendLevel)?.hint

  return (
    <>
      <div className="modal-section">
        <div className="modal-section-title">Backend — log level</div>
        <LevelPicker value={backendLevel} onChange={handleBackendLevel} />
        {levelHint && <div className="modal-setting-hint">{levelHint}</div>}
      </div>

      <SliderSetting
        title="Backend — log file lines"
        min={100} max={2000} step={100}
        value={backendMaxLines} onChange={handleBackendMaxLines}
        minLabel="100" maxLabel="2000"
        valueLabel={`${backendMaxLines} lines`}
        hint="In-memory buffer and the backend.log file. The file is refreshed every 10 seconds."
      />

      <div className="modal-section">
        <div className="modal-section-title">
          Compute — log level
          {computeLevel === null && <span className="log-offline-badge">offline</span>}
        </div>
        <LevelPicker
          value={computeLevel}
          onChange={handleComputeLevel}
          disabled={computeLevel === null}
        />
        {computeLevel === null && (
          <div className="modal-setting-hint">Compute service is unreachable.</div>
        )}
      </div>

      {computeLevel !== null && (
        <SliderSetting
          title="Compute — log file lines"
          min={50} max={1000} step={50}
          value={computeMaxLines} onChange={handleComputeMaxLines}
          minLabel="50" maxLabel="1000"
          valueLabel={`${computeMaxLines} lines`}
          hint="Compute-service buffer and the compute.log file."
        />
      )}

      <div className="modal-section">
        <div className="modal-section-title log-viewer-title">
          <span>Log viewer</span>
          <div className="log-viewer-controls">
            <div className="log-source-toggle">
              <button
                className={`log-source-btn${logSource === 'backend' ? ' active' : ''}`}
                onClick={() => setLogSource('backend')}
              >Backend</button>
              <button
                className={`log-source-btn${logSource === 'compute' ? ' active' : ''}${computeLevel === null ? ' disabled' : ''}`}
                disabled={computeLevel === null}
                onClick={() => setLogSource('compute')}
              >Compute</button>
            </div>
            <button className="modal-btn neutral log-load-btn" onClick={fetchLogs} disabled={loading}>
              {loading ? '...' : '↻'}
            </button>
            <label className="log-auto-label">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={e => setAutoRefresh(e.target.checked)}
              />
              auto 3s
            </label>
            <select
              className="log-n-select"
              value={logN}
              onChange={e => setLogN(Number(e.target.value))}
            >
              {[50, 100, 200, 500].map(v => (
                <option key={v} value={v}>{v} lines</option>
              ))}
            </select>
          </div>
        </div>

        {logError && <div className="modal-result err">{logError}</div>}

        <div
          ref={logViewerRef}
          className="log-viewer"
          onScroll={handleLogViewerScroll}
        >
          {logLines.length === 0
            ? <span className="log-viewer-empty">Press ↻ to load the logs</span>
            : logLines.map((line, i) => (
                <div key={i} className={`log-line ${getLineClass(line)}`}>{line}</div>
              ))
          }
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Maintenance section (DB + thumbnail cleanup)
// ═══════════════════════════════════════════════════════════════════════
function fmtBytes(b) {
  if (b == null || b === 0) return null
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function toDateInput(isoStr) {
  return isoStr ? isoStr.slice(0, 16) : ''
}

function ActionRow({ name, desc, sizeLabel, danger, onAction, busy, result, renderResult }) {
  const [confirming, setConfirming] = useState(false)

  function handleClick() {
    if (danger && !confirming) { setConfirming(true); return }
    setConfirming(false)
    onAction()
  }

  const btnClass = danger ? 'modal-btn danger-outline' : 'modal-btn neutral'
  const confirmBtnClass = danger ? 'modal-btn danger' : 'modal-btn'

  return (
    <div style={{ marginBottom: 10 }}>
      <div className="modal-action-row">
        <div className="modal-action-info">
          <span className="modal-action-name">{name}</span>
          <span className="modal-action-desc">
            {desc}
            {sizeLabel && <span className="modal-action-size"> · {sizeLabel}</span>}
          </span>
        </div>
        {confirming ? (
          <div className="modal-confirm-group">
            <span className="modal-confirm-text">Sure?</span>
            <button className={confirmBtnClass} onClick={handleClick} disabled={busy}>
              {busy ? <i className="mdi mdi-loading mdi-spin" /> : 'Yes'}
            </button>
            <button className="modal-btn neutral" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        ) : (
          <button className={btnClass} onClick={handleClick} disabled={busy}>
            {busy ? <i className="mdi mdi-loading mdi-spin" /> : <><i className="mdi mdi-delete-sweep-outline" /> Clear</>}
          </button>
        )}
      </div>
      {result && !result.ok && <div className="modal-result err">{result.text}</div>}
      {result?.ok && renderResult && <div className="modal-result ok">{renderResult(result.res)}</div>}
    </div>
  )
}

function useAsync() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  async function run(fn) {
    setBusy(true)
    setResult(null)
    let r
    try {
      const res = await fn()
      r = { ok: true, res }
      setResult(r)
    } catch (e) {
      r = { ok: false, text: e.message }
      setResult(r)
    } finally {
      setBusy(false)
    }
    return r
  }

  return { busy, result, run }
}

function MaintenanceSection({ onDatabaseCleared, cameraId, cameras }) {
  const [storageInfo, setStorageInfo] = useState(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [datesFilled, setDatesFilled] = useState(false)

  const camName = cameras?.find(c => c.id === cameraId)?.name ?? cameraId ?? '—'

  const allThumb    = useAsync()
  const basicThumb  = useAsync()
  const motionThumb = useAsync()
  const videoThumb  = useAsync()
  const ovThumb     = useAsync()
  const dbClear     = useAsync()
  const vacuumAct   = useAsync()

  useEffect(() => {
    getStorageInfo().then(setStorageInfo).catch(() => {})
  }, [])

  useEffect(() => {
    if (!cameraId) return
    getCameraDateRange(cameraId)
      .then(range => {
        if (range.date_from && range.date_to) {
          setDateFrom(toDateInput(range.date_from))
          setDateTo(toDateInput(range.date_to))
          setDatesFilled(true)
        }
      })
      .catch(() => {})
  }, [cameraId])

  function refreshStorage() {
    getStorageInfo().then(setStorageInfo).catch(() => {})
  }

  const df = dateFrom ? dateFrom + ':00' : null
  const dt = dateTo   ? dateTo   + ':00' : null

  async function handleClearAllThumbs() {
    await allThumb.run(() => clearAllThumbnails(cameraId, df, dt))
    refreshStorage()
  }

  async function handleClearBasic() {
    await basicThumb.run(() => clearThumbnails(cameraId, df, dt))
    refreshStorage()
  }

  async function handleClearMotion() {
    await motionThumb.run(async () => {
      const results = await Promise.all([
        clearDiffThumbnails(cameraId, df, dt),
        clearErosionThumbnails(cameraId, df, dt),
      ])
      const total = results.reduce((s, r) => s + (r.deleted_files || 0), 0)
      return { total }
    })
    refreshStorage()
  }

  async function handleClearVideo() {
    await videoThumb.run(() => clearVideoThumbnails(cameraId, df, dt))
    refreshStorage()
  }

  async function handleClearOpenVino() {
    await ovThumb.run(() => clearOpenVinoThumbnails(cameraId, df, dt))
    refreshStorage()
  }

  async function handleClearDb() {
    const r = await dbClear.run(() => clearDatabase(cameraId, df, dt))
    if (r?.ok) onDatabaseCleared()
    refreshStorage()
  }

  async function handleVacuum() {
    await vacuumAct.run(vacuumDatabase)
    refreshStorage()
  }

  const dbSizeStr    = storageInfo ? fmtBytes(storageInfo.db_size_bytes)    : null
  const thumbSizeStr = storageInfo ? fmtBytes(storageInfo.thumbnails_size_bytes) : null

  return (
    <>
      {/* Camera indicator */}
      {cameraId && (
        <div className="modal-section" style={{ paddingBottom: 6 }}>
          <div className="modal-setting-hint">
            <i className="mdi mdi-cctv" style={{ marginRight: 5 }} />
            Camera: <strong>{camName}</strong>
          </div>
        </div>
      )}

      {/* Date range filter */}
      <div className="modal-section">
        <div className="modal-section-title">Date range</div>
        <div className="modal-setting-hint" style={{ marginBottom: 8 }}>
          All clear operations are applied only to files within this range.
          {datesFilled && <span style={{ color: '#86efac', marginLeft: 6 }}>
            <i className="mdi mdi-check-circle" style={{ marginRight: 3 }} />
            auto-filled from camera
          </span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="datetime-local"
            className="modal-text-input"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setDatesFilled(false) }}
            style={{ flex: 1, minWidth: 170, colorScheme: 'dark' }}
          />
          <span style={{ color: 'var(--text-dim)', fontSize: 'calc(var(--font-base) * 0.85)' }}>→</span>
          <input
            type="datetime-local"
            className="modal-text-input"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setDatesFilled(false) }}
            style={{ flex: 1, minWidth: 170, colorScheme: 'dark' }}
          />
          <button className="modal-btn neutral" onClick={() => {
            setDateFrom(''); setDateTo(''); setDatesFilled(false)
          }}>
            <i className="mdi mdi-close" /> All dates
          </button>
        </div>
        {(df || dt) && (
          <div className="modal-setting-hint" style={{ marginTop: 6, color: '#60a5fa' }}>
            <i className="mdi mdi-filter-outline" style={{ marginRight: 4 }} />
            Filter active: {df ? df.slice(0, 16) : '…'} → {dt ? dt.slice(0, 16) : '…'}
          </div>
        )}
      </div>

      {/* Thumbnail cleanup */}
      <div className="modal-section">
        <div className="modal-section-title">Thumbnail cache</div>

        <ActionRow
          name="All thumbnails"
          desc="Basic + motion + video + detection (all types)"
          sizeLabel={thumbSizeStr}
          onAction={handleClearAllThumbs}
          busy={allThumb.busy}
          result={allThumb.result}
          renderResult={res => {
            const t = res?.types
            if (!t) return 'Cleared'
            const parts = Object.entries(t)
              .filter(([, v]) => v.deleted_files > 0)
              .map(([k, v]) => `${k}: ${v.deleted_files}`)
            return `Deleted ${res.total_files} file(s)${parts.length ? ` (${parts.join(', ')})` : ''}`
          }}
        />

        <ActionRow
          name="Basic thumbnails"
          desc="256×256 thumbnails for Normal mode"
          onAction={handleClearBasic}
          busy={basicThumb.busy}
          result={basicThumb.result}
          renderResult={res => `Deleted ${res?.deleted_files ?? 0} file(s)`}
        />

        <ActionRow
          name="Motion thumbnails"
          desc="Motion highlight, Motion noise-filtered — motion analysis modes"
          onAction={handleClearMotion}
          busy={motionThumb.busy}
          result={motionThumb.result}
          renderResult={res => `Deleted ${res?.total ?? 0} file(s)`}
        />

        <ActionRow
          name="Object detection (local)"
          desc="object_detection DB records for the selected range. Disk cache with bounding boxes is cleared on full clear."
          onAction={handleClearOpenVino}
          busy={ovThumb.busy}
          result={ovThumb.result}
          renderResult={res => {
            const parts = []
            if (res?.deleted_files) parts.push(`${res.deleted_files} file(s)`)
            if (res?.deleted_rows)  parts.push(`${res.deleted_rows} DB rows`)
            return `Deleted: ${parts.join(', ') || '0'}`
          }}
        />

        <ActionRow
          name="Video thumbnails"
          desc="Preview cache for video files (first frame, grid, GIF) + DB records"
          onAction={handleClearVideo}
          busy={videoThumb.busy}
          result={videoThumb.result}
          renderResult={res => `Deleted ${res?.deleted_files ?? 0} file(s)`}
        />
      </div>

      {/* Database */}
      <div className="modal-section">
        <div className="modal-section-title">Database</div>

        <ActionRow
          danger
          name="Clear file records"
          desc={`Delete records${cameraId ? ` for camera "${camName}"` : ''} from the DB for the selected range (files on disk are not touched)`}
          sizeLabel={dbSizeStr}
          onAction={handleClearDb}
          busy={dbClear.busy}
          result={dbClear.result}
          renderResult={() => 'Records cleared.'}
        />

        <div className="modal-action-row" style={{ marginTop: 4 }}>
          <div className="modal-action-info">
            <span className="modal-action-name">Optimize database</span>
            <span className="modal-action-desc">
              VACUUM — shrink the DB file size after deleting records
              {dbSizeStr && <span className="modal-action-size"> · {dbSizeStr}</span>}
            </span>
          </div>
          <button className="modal-btn neutral" onClick={handleVacuum} disabled={vacuumAct.busy}>
            {vacuumAct.busy
              ? <i className="mdi mdi-loading mdi-spin" />
              : <><i className="mdi mdi-database-cog-outline" /> Vacuum</>
            }
          </button>
        </div>
        {vacuumAct.result && !vacuumAct.result.ok && (
          <div className="modal-result err">{vacuumAct.result.text}</div>
        )}
        {vacuumAct.result?.ok && (
          <div className="modal-result ok">Database optimized.</div>
        )}
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Combined Service tab
// ═══════════════════════════════════════════════════════════════════════
export default function ServiceTab({ onDatabaseCleared, cameraId, cameras }) {
  return (
    <>
      <div className="modal-ai-provider-header">
        <i className="mdi mdi-cog-outline" /> Tasks
      </div>
      <TasksSection />

      <div className="modal-ai-provider-header">
        <i className="mdi mdi-text-box-outline" /> Logging
      </div>
      <LoggingSection />

      <div className="modal-ai-provider-header">
        <i className="mdi mdi-wrench-outline" /> Maintenance
      </div>
      <MaintenanceSection
        onDatabaseCleared={onDatabaseCleared}
        cameraId={cameraId}
        cameras={cameras}
      />
    </>
  )
}
