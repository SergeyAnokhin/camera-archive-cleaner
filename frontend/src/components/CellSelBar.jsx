import { useState } from 'react'
import { formatBytes } from './navUtils.js'

// Toolbar shown when selecting day/hour cells on the heatmap: bulk select,
// delete (hour level only) and AI analysis across the selected cells.

const CELL_PROVIDERS = [
  { key: 'openvino', label: 'OpenVINO Detection', icon: 'mdi-chip',     modelKey: 'openvino_model', defaultModel: 'yolov8n' },
  { key: 'gemini',   label: 'Gemini Analysis',    icon: 'mdi-google',   modelKey: 'gemini_model',   defaultModel: 'gemini-3.1-flash-lite' },
  { key: 'claude',   label: 'Claude Analysis',    icon: 'mdi-robot',    modelKey: 'claude_model',   defaultModel: 'claude-haiku-4-5-20251001' },
]

export default function CellSelBar({ level, periods, selectedMap, onSelectAll, onSelectNone, onClose,
                       onDelete, loading, error, confirmOpen, onSetConfirmOpen,
                       onAnalyze, analyzing, analyzeProgress, analyzeError,
                       onSendToTask, taskSent, taskSendError }) {
  const [providerKey, setProviderKey] = useState('openvino')

  const providerCfg  = CELL_PROVIDERS.find(p => p.key === providerKey)
  const currentModel = localStorage.getItem(providerCfg.modelKey) || providerCfg.defaultModel
  const ovConf       = (() => {
    try { return JSON.parse(localStorage.getItem('mode_params_openvino_detection') || '{}').confidence ?? 25 }
    catch { return 25 }
  })()

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

        {/* Model label (read-only — set in Tools settings) */}
        <span style={{ ...dim, display: 'flex', alignItems: 'center', gap: 4 }}>
          <i className="mdi mdi-cog-outline" style={{ opacity: 0.6 }} />
          {currentModel}
          {providerKey === 'openvino' && <span style={{ marginLeft: 4 }}>· {ovConf}%</span>}
        </span>

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

        {/* Send to Task button */}
        {onSendToTask && (
          <button className="modal-btn neutral"
            disabled={count === 0 || analyzing}
            onClick={() => onSendToTask(providerKey, currentModel, ovConf / 100)}
            title="Отправить выбранные ячейки в очередь задач"
            style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', borderColor: 'rgba(99,102,241,0.3)' }}
          >
            <i className="mdi mdi-tray-arrow-down" /> В задачи
          </button>
        )}
        {taskSent && (
          <span style={{ fontSize: 'calc(var(--font-base) * 0.82)', color: '#86efac' }}>
            <i className="mdi mdi-check-circle-outline" /> Задачи добавлены
          </span>
        )}
        {taskSendError && (
          <span style={{ fontSize: 'calc(var(--font-base) * 0.82)', color: '#f87171' }}>
            <i className="mdi mdi-alert-circle-outline" /> {taskSendError}
          </span>
        )}

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
