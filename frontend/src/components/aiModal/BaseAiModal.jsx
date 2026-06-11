import { useState, useEffect } from 'react'
import { createTask } from '../../api.js'
import '../GeminiAnalysisModal.css'

// Shared shell for the AI analysis modals (Gemini / Claude / OpenVINO):
// backdrop + Escape-to-close, header, run row with optional "В задачи" button,
// task-queue submission and its feedback. Provider-specific content goes into
// `beforeRunRow` (e.g. prompt textarea) and `children` (stats, results, errors).
//
// `task`: null to hide the button, else { type, params, label, disabled, title }
// — base calls createTask() with type/params/label on click.
export default function BaseAiModal({
  icon, iconStyle, title, onClose,
  fileCount, model, showNoKey,
  beforeRunRow,
  running, onRun, runDisabled,
  task, onTaskCreated,
  children,
}) {
  const [taskSent, setTaskSent]   = useState(false)
  const [taskError, setTaskError] = useState(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  async function handleSendToTask() {
    setTaskSent(false)
    setTaskError(null)
    try {
      await createTask({ type: task.type, params: task.params, label: task.label })
      setTaskSent(true)
      onTaskCreated?.()
    } catch (e) {
      setTaskError(e.message)
    }
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="gai-backdrop" onClick={handleBackdrop}>
      <div className="gai-card">
        <div className="gai-header">
          <span><i className={`mdi ${icon}`} style={iconStyle} /> {title}</span>
          <button className="gai-close" onClick={onClose}>×</button>
        </div>

        <div className="gai-body">
          {beforeRunRow}

          <div className="gai-run-row">
            <div className="gai-run-info">
              <i className="mdi mdi-image-multiple-outline" />
              {fileCount} фото
              <span className="gai-run-model">{model}</span>
              {showNoKey && <span className="gai-no-key"> · нет API key</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {task && (
                <button
                  className="gai-run-btn"
                  style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', borderColor: 'rgba(99,102,241,0.3)' }}
                  onClick={handleSendToTask}
                  disabled={task.disabled}
                  title={task.title}
                >
                  <i className="mdi mdi-tray-arrow-down" /> В задачи
                </button>
              )}
              <button className="gai-run-btn" onClick={onRun} disabled={runDisabled}>
                {running
                  ? <><i className="mdi mdi-loading mdi-spin" /> Анализ…</>
                  : <><i className="mdi mdi-play" /> Запустить</>
                }
              </button>
            </div>
          </div>

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

          {children}
        </div>
      </div>
    </div>
  )
}
