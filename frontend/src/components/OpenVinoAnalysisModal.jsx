import { useState, useEffect } from 'react'
import { openvinoAnalyzeBatch } from '../api.js'
import { resolveAiIcons } from '../aiHelpers.js'
import './GeminiAnalysisModal.css'

const CONFIDENCE_KEY = 'openvino_confidence'
const DEFAULT_CONFIDENCE = 0.25
const EXCLUDED_OBJECTS_KEY = 'detection_excluded_objects'

export default function OpenVinoAnalysisModal({ fileIds, model, onClose, onComplete }) {
  const [confidence, setConfidence] = useState(
    () => parseFloat(localStorage.getItem(CONFIDENCE_KEY) || DEFAULT_CONFIDENCE)
  )
  const [running, setRunning]         = useState(false)
  const [result, setResult]           = useState(null)
  const [error, setError]             = useState(null)
  const [justExcluded, setJustExcluded] = useState(new Set())

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  function handleConfidenceChange(e) {
    const v = parseFloat(e.target.value)
    setConfidence(v)
    localStorage.setItem(CONFIDENCE_KEY, v)
  }

  function handleExcludeObj(label) {
    if (!window.confirm(`Добавить «${label}» в исключённые объекты?`)) return
    const existing = (() => { try { return JSON.parse(localStorage.getItem(EXCLUDED_OBJECTS_KEY) || '[]') } catch { return [] } })()
    const lower = label.toLowerCase()
    if (!existing.includes(lower)) {
      localStorage.setItem(EXCLUDED_OBJECTS_KEY, JSON.stringify([...existing, lower]))
    }
    setJustExcluded(prev => new Set([...prev, lower]))
  }

  async function handleRun() {
    setRunning(true)
    setResult(null)
    setError(null)
    try {
      const data = await openvinoAnalyzeBatch({ fileIds, modelName: model, confidence })
      setResult(data)
      if (data.saved_count > 0) onComplete?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  const totalDetected = result
    ? Object.values(result.results).filter(objs => objs.length > 0).length
    : 0

  return (
    <div className="gai-backdrop" onClick={onClose}>
      <div className="gai-card" onClick={e => e.stopPropagation()}>

        <div className="gai-header">
          <span><i className="mdi mdi-chip" style={{ color: '#60a5fa' }} /> OpenVINO Detection</span>
          <button className="gai-close" onClick={onClose}><i className="mdi mdi-close" /></button>
        </div>

        <div className="gai-body">

          {/* Run row */}
          <div className="gai-run-row">
            <div className="gai-run-info">
              <i className="mdi mdi-image-multiple-outline" />
              <span>{fileIds.length} фото</span>
              <span className="gai-run-model">{model}</span>
            </div>
            <button className="gai-run-btn" onClick={handleRun} disabled={running}>
              {running
                ? <><i className="mdi mdi-loading mdi-spin" /> Анализ...</>
                : <><i className="mdi mdi-play" /> Запустить</>
              }
            </button>
          </div>

          {/* Confidence slider */}
          <div className="gai-section">
            <div className="gai-label">Порог уверенности: <strong>{Math.round(confidence * 100)}%</strong></div>
            <input
              type="range"
              min="0.10" max="0.80" step="0.05"
              value={confidence}
              onChange={handleConfidenceChange}
              disabled={running}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'calc(var(--font-base) * 0.75)', color: 'var(--text-dim)', marginTop: 2 }}>
              <span>10% — чувствительнее, больше шума</span>
              <span>80% — строже, меньше объектов</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="gai-error">
              <i className="mdi mdi-alert-circle-outline" /> {error}
            </div>
          )}

          {/* Stats */}
          {result && (
            <div className="gai-stats">
              <span>
                <i className="mdi mdi-check-circle-outline" />
                <span className="gai-saved-badge">{result.saved_count} сохранено</span>
              </span>
              <span><i className="mdi mdi-eye-outline" /> объекты найдены в {totalDetected}/{result.images_used} фото</span>
              <span><i className="mdi mdi-timer-outline" /> {(result.elapsed_ms / 1000).toFixed(1)} с</span>
              <span className="gai-stats-detail">~{result.images_used > 0 ? Math.round(result.elapsed_ms / result.images_used) : 0} мс/фото</span>
            </div>
          )}

          {/* Per-image results */}
          {result && Object.keys(result.results).length > 0 && (
            <div className="gai-section">
              <div className="gai-response-label">Результаты по фото</div>
              <div className="gai-images-list">
                {Object.entries(result.results).map(([fid, objs], idx) => {
                  const icons = resolveAiIcons(objs.join(' '))
                  return (
                    <div key={fid} className="gai-image-entry">
                      <div className="gai-image-idx">#{idx + 1}</div>
                      <div className="gai-image-content">
                        {icons.length > 0
                          ? (
                            <div className="gai-image-objects">
                              {icons.map(ic => (
                                <span key={ic.label} className="gai-obj-tag">
                                  {ic.emoji} {ic.label}
                                  <span
                                    className="gai-obj-exclude"
                                    style={{ opacity: justExcluded.has(ic.label.toLowerCase()) ? 0.3 : undefined }}
                                    title="Добавить в исключённые объекты"
                                    onClick={e => { e.stopPropagation(); handleExcludeObj(ic.label) }}
                                  >×</span>
                                </span>
                              ))}
                            </div>
                          )
                          : <div className="gai-image-desc" style={{ color: 'var(--text-dim)' }}>объекты не обнаружены</div>
                        }
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
