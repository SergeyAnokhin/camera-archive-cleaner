import { useState, useEffect } from 'react'
import { openvinoAnalyzeBatch, createTask, getClassesList } from '../api.js'
import { resolveAiIcons } from '../aiHelpers.js'
import './GeminiAnalysisModal.css'

const CONFIDENCE_KEY = 'openvino_confidence'
const DEFAULT_CONFIDENCE = 0.25
const EXCLUDED_OBJECTS_KEY = 'detection_excluded_objects'

// taskContext: { cameraId, dateFrom, dateTo } — if provided, shows "Send to Task" button
export default function OpenVinoAnalysisModal({ fileIds, model, taskContext, onClose, onComplete, onTaskCreated }) {
  const [confidence, setConfidence] = useState(
    () => parseFloat(localStorage.getItem(CONFIDENCE_KEY) || DEFAULT_CONFIDENCE)
  )
  const [running, setRunning]           = useState(false)
  const [progress, setProgress]         = useState(null)   // { current, total }
  const [allResults, setAllResults]     = useState([])
  const [error, setError]               = useState(null)
  const [justExcluded, setJustExcluded] = useState(new Set())
  const [taskSent, setTaskSent]         = useState(false)
  const [taskError, setTaskError]       = useState(null)

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
    setProgress({ current: 0, total: fileIds.length })
    setAllResults([])
    setError(null)
    try {
      const results = []
      for (let i = 0; i < fileIds.length; i++) {
        setProgress({ current: i, total: fileIds.length })
        const data = await openvinoAnalyzeBatch({ fileIds: [fileIds[i]], modelName: model, confidence, classes: getClassesList() })
        results.push(data)
      }
      setProgress({ current: fileIds.length, total: fileIds.length })
      setAllResults(results)
      if (results.some(r => r.saved_count > 0)) onComplete?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  async function handleSendToTask() {
    if (!taskContext) return
    setTaskSent(false)
    setTaskError(null)
    try {
      await createTask({
        type: 'openvino',
        params: {
          camera_id: taskContext.cameraId,
          date_from: taskContext.dateFrom,
          date_to: taskContext.dateTo,
          model_name: model,
          confidence,
          classes: getClassesList(),
        },
        label: `OpenVINO · ${taskContext.dateFrom?.slice(0, 16) ?? ''}`,
      })
      setTaskSent(true)
      onTaskCreated?.()
    } catch (e) {
      setTaskError(e.message)
    }
  }

  // Aggregate results
  const totalSaved = allResults.reduce((s, r) => s + (r.saved_count || 0), 0)
  const totalUsed  = allResults.reduce((s, r) => s + (r.images_used || 0), 0)
  const totalMs    = allResults.reduce((s, r) => s + (r.elapsed_ms || 0), 0)
  const allResultEntries = allResults.flatMap(r => Object.entries(r.results || {}))
  const totalDetected = allResultEntries.filter(([, objs]) => objs.length > 0).length

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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {taskContext && (
                <button
                  className="gai-run-btn"
                  style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', borderColor: 'rgba(99,102,241,0.3)' }}
                  onClick={handleSendToTask}
                  title="Отправить в очередь задач (обработает весь период)"
                >
                  <i className="mdi mdi-tray-arrow-down" /> В задачи
                </button>
              )}
              <button className="gai-run-btn" onClick={handleRun} disabled={running}>
                {running
                  ? <><i className="mdi mdi-loading mdi-spin" /> Анализ...</>
                  : <><i className="mdi mdi-play" /> Запустить</>
                }
              </button>
            </div>
          </div>

          {/* Task sent feedback */}
          {taskSent && (
            <div className="gai-stats" style={{ color: '#86efac' }}>
              <i className="mdi mdi-check-circle-outline" /> Задача добавлена в очередь
            </div>
          )}
          {taskError && (
            <div className="gai-error">
              <i className="mdi mdi-alert-circle-outline" /> {taskError}
            </div>
          )}

          {/* Progress bar */}
          {running && progress && (
            <div className="gai-section">
              <div className="gai-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Прогресс</span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              <div style={{ background: '#1f2937', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <div style={{
                  background: 'var(--accent)',
                  height: '100%',
                  width: `${progress.total > 0 ? Math.round(progress.current / progress.total * 100) : 0}%`,
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          )}

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
          {allResults.length > 0 && (
            <div className="gai-stats">
              <span>
                <i className="mdi mdi-check-circle-outline" />
                <span className="gai-saved-badge">{totalSaved} сохранено</span>
              </span>
              <span><i className="mdi mdi-eye-outline" /> объекты найдены в {totalDetected}/{totalUsed} фото</span>
              <span><i className="mdi mdi-timer-outline" /> {(totalMs / 1000).toFixed(1)} с</span>
              <span className="gai-stats-detail">~{totalUsed > 0 ? Math.round(totalMs / totalUsed) : 0} мс/фото</span>
            </div>
          )}

          {/* Per-image results */}
          {allResultEntries.length > 0 && (
            <div className="gai-section">
              <div className="gai-response-label">Результаты по фото</div>
              <div className="gai-images-list">
                {allResultEntries.map(([fid, objs], idx) => {
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
