import { useState, useEffect, useRef, useCallback } from 'react'
import SliderSetting from '../SliderSetting.jsx'
import { BASE } from '../../../api/http.js'

// Logging section (formerly LoggingTab)
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

export default function LoggingSection() {
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
    fetch(BASE + '/logging/config')
      .then(r => r.json())
      .then(d => { setBackendLevel(d.level || 'INFO'); setBackendMaxLines(d.file_max_lines || 500) })
      .catch(() => {})

    fetch(BASE + '/logging/compute/config')
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
    const endpoint = logSource === 'compute' ? BASE + '/logging/compute/tail' : BASE + '/logging/tail'
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
    fetch(BASE + '/logging/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, file_max_lines: maxLines }),
    }).catch(() => {})
  }

  function applyComputeConfig(level, maxLines) {
    fetch(BASE + '/logging/compute/config', {
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
