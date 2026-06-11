import { useEffect } from 'react'
import { resolveAiIcons } from '../aiHelpers.js'
import './GeminiAnalysisModal.css'

const TYPE_LABEL = {
  openvino: 'OpenVINO Detection',
  gemini:   'Gemini AI Analysis',
  claude:   'Claude AI Analysis',
}

function pad2(n) { return String(n).padStart(2, '0') }

function fmtDuration(ms) {
  if (!ms) return null
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60), r = s % 60
  return r > 0 ? `${m} min ${r} s` : `${m} min`
}

export default function TaskResultsModal({ task, results, stats, totalCount, onClose, onNavigateToHour }) {
  const params  = task.params || {}
  const model   = params.model_name || params.model || ''
  const label   = TYPE_LABEL[task.type] || task.type
  const isRunning = ['running', 'pausing', 'paused', 'queued'].includes(task.status)
  const withObjects = results.filter(r => r.objects && r.objects.trim())
  const isTruncated = totalCount != null && totalCount > results.length

  const hasTokenStats = stats && (stats.input_tokens > 0 || stats.output_tokens > 0)

  // LM params to show
  const delayMin  = params.delay_min_sec
  const delayMax  = params.delay_max_sec
  const fromH     = params.active_from_hour
  const toH       = params.active_to_hour
  const hasDelay  = delayMax > 0
  const hasWindow = fromH != null && toH != null

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  function hourLabel(ts) {
    return ts ? `${ts.slice(0, 10)} ${ts.slice(11, 13)}:00` : ''
  }

  return (
    <div className="gai-backdrop" onClick={onClose}>
      <div className="gai-card" onClick={e => e.stopPropagation()}>

        <div className="gai-header">
          <span><i className="mdi mdi-magnify-scan" style={{ color: '#60a5fa' }} /> {label} · Results</span>
          <button className="gai-close" onClick={onClose} title={isRunning ? 'Back to the task' : 'Close'}>
            {isRunning
              ? <><i className="mdi mdi-arrow-left" /> Live view</>
              : <i className="mdi mdi-close" />}
          </button>
        </div>

        <div className="gai-body">

          <div className="gai-run-row">
            <div className="gai-run-info">
              <i className="mdi mdi-image-multiple-outline" />
              <span>{isTruncated ? `${totalCount.toLocaleString()} photos` : `${results.length} photos`}</span>
              {model && <span className="gai-run-model">{model}</span>}
              {isRunning && (
                <span style={{ fontSize: 'calc(var(--font-base) * 0.8)', color: '#60a5fa' }}>
                  <i className="mdi mdi-loading mdi-spin" /> in progress
                </span>
              )}
            </div>
          </div>

          {/* LM parameters row */}
          {(hasDelay || hasWindow) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 0 2px' }}>
              {hasDelay && (
                <span className="tc__tag" style={{ fontSize: 'calc(var(--font-base) * 0.8)' }}>
                  <i className="mdi mdi-timer-pause-outline" /> {delayMin}–{delayMax}s pause
                </span>
              )}
              {hasWindow && (
                <span className="tc__tag" style={{ fontSize: 'calc(var(--font-base) * 0.8)' }}>
                  <i className="mdi mdi-clock-time-four-outline" /> {pad2(fromH)}:00–{pad2(toH)}:00
                </span>
              )}
            </div>
          )}

          {/* Stats */}
          {hasTokenStats ? (
            <div className="gai-stats">
              <span><i className="mdi mdi-eye-outline" /> objects in {withObjects.length}/{results.length}</span>
              <span><i className="mdi mdi-counter" /> {(stats.input_tokens + stats.output_tokens).toLocaleString()} tok</span>
              <span className="gai-stats-detail">in {stats.input_tokens.toLocaleString()} · out {stats.output_tokens.toLocaleString()}</span>
              {stats.cost_usd > 0 && <span><i className="mdi mdi-currency-usd" /> ${stats.cost_usd.toFixed(6)}</span>}
              {stats.elapsed_ms > 0 && <span><i className="mdi mdi-timer-outline" /> {fmtDuration(stats.elapsed_ms)}</span>}
            </div>
          ) : (
            <div className="gai-stats">
              <span><i className="mdi mdi-eye-outline" /> objects found in {withObjects.length}/{results.length} photos</span>
            </div>
          )}

          {results.length > 0 && (
            <div className="gai-section">
              <div className="gai-response-label">
                Per-photo results
                {isTruncated && (
                  <span style={{ marginLeft: 8, fontWeight: 'normal', color: 'var(--text-dim)', fontSize: 'calc(var(--font-base) * 0.85)' }}>
                    (last {results.length.toLocaleString()} of {totalCount.toLocaleString()})
                  </span>
                )}
              </div>
              <div className="gai-images-list">
                {results.map((r, idx) => {
                  const icons = resolveAiIcons(r.objects || '')
                  return (
                    <div key={r.file_id} className="gai-image-entry" style={{ alignItems: 'center' }}>
                      <div className="gai-image-idx">#{idx + 1}</div>
                      <div className="gai-image-content" style={{ flex: 1 }}>
                        {icons.length > 0
                          ? (
                            <div className="gai-image-objects">
                              {icons.map(ic => (
                                <span key={ic.label} className="gai-obj-tag">
                                  {ic.emoji} {ic.label}
                                </span>
                              ))}
                            </div>
                          )
                          : <div className="gai-image-desc" style={{ color: 'var(--text-dim)' }}>no objects detected</div>
                        }
                      </div>
                      {onNavigateToHour && (
                        <button
                          className="gai-run-btn"
                          style={{ padding: '3px 8px', fontSize: 'calc(var(--font-base) * 0.8)', whiteSpace: 'nowrap', flexShrink: 0 }}
                          title={`Go to ${hourLabel(r.timestamp)}`}
                          onClick={() => onNavigateToHour(r.timestamp)}
                        >
                          <i className="mdi mdi-clock-outline" /> {hourLabel(r.timestamp)}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {results.length === 0 && (
            <div className="gai-error" style={{ color: 'var(--text-dim)', background: 'transparent' }}>
              <i className="mdi mdi-information-outline" />
              {isRunning ? ' Analysis has not finished any photo yet' : ' No saved results for this task'}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
