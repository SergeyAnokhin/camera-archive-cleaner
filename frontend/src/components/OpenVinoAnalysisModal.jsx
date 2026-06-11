import { useState } from 'react'
import { openvinoAnalyzeBatch, getClassesList } from '../api.js'
import { resolveAiIcons } from '../aiHelpers.js'
import BaseAiModal from './aiModal/BaseAiModal.jsx'

const CONFIDENCE_KEY = 'openvino_confidence'
const DEFAULT_CONFIDENCE = 0.25

// taskContext: { cameraId, dateFrom, dateTo } — if provided, shows "Send to Task" button
export default function OpenVinoAnalysisModal({ fileIds, model, taskContext, onClose, onComplete, onTaskCreated }) {
  const [confidence, setConfidence] = useState(
    () => parseFloat(localStorage.getItem(CONFIDENCE_KEY) || DEFAULT_CONFIDENCE)
  )
  const [running, setRunning]       = useState(false)
  const [progress, setProgress]     = useState(null)   // { current, total }
  const [allResults, setAllResults] = useState([])
  const [error, setError]           = useState(null)

  function handleConfidenceChange(e) {
    const v = parseFloat(e.target.value)
    setConfidence(v)
    localStorage.setItem(CONFIDENCE_KEY, v)
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

  // Aggregate results
  const totalSaved = allResults.reduce((s, r) => s + (r.saved_count || 0), 0)
  const totalUsed  = allResults.reduce((s, r) => s + (r.images_used || 0), 0)
  const totalMs    = allResults.reduce((s, r) => s + (r.elapsed_ms || 0), 0)
  const allResultEntries = allResults.flatMap(r => Object.entries(r.results || {}))
  const totalDetected = allResultEntries.filter(([, objs]) => objs.length > 0).length

  return (
    <BaseAiModal
      icon="mdi-chip" iconStyle={{ color: '#60a5fa' }}
      title="OpenVINO Detection"
      onClose={onClose}
      fileCount={fileIds.length} model={model}
      running={running} onRun={handleRun} runDisabled={running}
      task={taskContext ? {
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
        title: 'Отправить в очередь задач (обработает весь период)',
      } : null}
      onTaskCreated={onTaskCreated}
    >
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
    </BaseAiModal>
  )
}
