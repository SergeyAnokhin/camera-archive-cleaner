import { useEffect } from 'react'
import { resolveAiIcons } from '../aiHelpers.js'
import './GeminiAnalysisModal.css'

const TYPE_LABEL = {
  openvino: 'OpenVINO Detection',
  gemini:   'Gemini AI Analysis',
  claude:   'Claude AI Analysis',
}

export default function TaskResultsModal({ task, results, onClose, onNavigateToHour }) {
  const params = task.params || {}
  const model  = params.model_name || params.model || ''
  const label  = TYPE_LABEL[task.type] || task.type
  const withObjects = results.filter(r => r.objects && r.objects.trim())

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  function hourLabel(ts) {
    // "2024-07-30T17:29:54" → "2024-07-30 17:00"
    return ts ? `${ts.slice(0, 10)} ${ts.slice(11, 13)}:00` : ''
  }

  return (
    <div className="gai-backdrop" onClick={onClose}>
      <div className="gai-card" onClick={e => e.stopPropagation()}>

        <div className="gai-header">
          <span><i className="mdi mdi-magnify-scan" style={{ color: '#60a5fa' }} /> {label} · Результаты</span>
          <button className="gai-close" onClick={onClose}><i className="mdi mdi-close" /></button>
        </div>

        <div className="gai-body">

          <div className="gai-run-row">
            <div className="gai-run-info">
              <i className="mdi mdi-image-multiple-outline" />
              <span>{results.length} фото</span>
              {model && <span className="gai-run-model">{model}</span>}
            </div>
          </div>

          <div className="gai-stats">
            <span><i className="mdi mdi-eye-outline" /> объекты найдены в {withObjects.length}/{results.length} фото</span>
          </div>

          {results.length > 0 && (
            <div className="gai-section">
              <div className="gai-response-label">Результаты по фото</div>
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
                          : <div className="gai-image-desc" style={{ color: 'var(--text-dim)' }}>объекты не обнаружены</div>
                        }
                      </div>
                      {onNavigateToHour && (
                        <button
                          className="gai-run-btn"
                          style={{ padding: '3px 8px', fontSize: 'calc(var(--font-base) * 0.8)', whiteSpace: 'nowrap', flexShrink: 0 }}
                          title={`Перейти к ${hourLabel(r.timestamp)}`}
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
              <i className="mdi mdi-information-outline" /> Нет сохранённых результатов для этой задачи
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
