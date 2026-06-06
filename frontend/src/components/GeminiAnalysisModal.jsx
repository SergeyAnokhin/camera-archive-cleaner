import { useState, useEffect } from 'react'
import { geminiAnalyze, geminiAnalyzeBatch, createTask } from '../api.js'
import { STRUCTURED_ANALYSIS_TEMPLATE, GEMINI_FREEFORM_PROMPT } from '../prompts.js'
import './GeminiAnalysisModal.css'

const GEMINI_API_KEY_KEY = 'gemini_api_key'
const GEMINI_MODEL_KEY   = 'gemini_model'
const GEMINI_PROMPT_KEY  = 'gemini_structured_prompt'
const GEMINI_DEFAULT_MODEL  = 'gemini-3.1-flash-lite'

function buildStructuredPrompt(n) {
  const template = localStorage.getItem(GEMINI_PROMPT_KEY) || STRUCTURED_ANALYSIS_TEMPLATE
  return template.replace(/\{n\}/g, n)
}

// structured=true → structured prompt + JSON response + onComplete callback
// structured=false → free prompt, raw text (original behavior)
// taskContext: { cameraId, dateFrom, dateTo } — if provided, shows "Send to Task" button
export default function GeminiAnalysisModal({ fileIds, onClose, structured = false, onComplete, taskContext, onTaskCreated }) {
  const apiKey = localStorage.getItem(GEMINI_API_KEY_KEY) || ''
  const model  = localStorage.getItem(GEMINI_MODEL_KEY)  || GEMINI_DEFAULT_MODEL

  const [prompt, setPrompt] = useState(() =>
    structured
      ? buildStructuredPrompt(fileIds.length)
      : (localStorage.getItem('gemini_prompt') || GEMINI_FREEFORM_PROMPT)
  )
  const [running, setRunning]   = useState(false)
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState(null)
  const [taskSent, setTaskSent] = useState(false)
  const [taskError, setTaskError] = useState(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  function handlePromptChange(e) {
    setPrompt(e.target.value)
    if (!structured) localStorage.setItem(GEMINI_PROMPT_KEY, e.target.value)
  }

  async function handleRun() {
    if (!apiKey) {
      setError('API key не задан. Откройте Tools → Google AI.')
      return
    }
    setRunning(true)
    setResult(null)
    setError(null)
    try {
      if (structured) {
        const data = await geminiAnalyzeBatch({ fileIds, prompt, model, apiKey })
        setResult(data)
        if (data.saved_count > 0) onComplete?.()
      } else {
        const data = await geminiAnalyze({ fileIds, prompt, model, apiKey })
        setResult(data)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  async function handleSendToTask() {
    if (!taskContext) return
    if (!apiKey) { setTaskError('API key не задан. Откройте Tools → Google AI.'); return }
    setTaskSent(false)
    setTaskError(null)
    try {
      await createTask({
        type: 'gemini',
        params: {
          camera_id: taskContext.cameraId,
          date_from: taskContext.dateFrom,
          date_to: taskContext.dateTo,
          model,
          api_key: apiKey,
        },
        label: `Gemini · ${taskContext.dateFrom?.slice(0, 16) ?? ''}`,
      })
      setTaskSent(true)
      onTaskCreated?.()
    } catch (e) {
      setTaskError(e.message)
    }
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose()
  }

  const parsedImages = result?.parsed?.images ?? null
  const parsedScene  = result?.parsed?.scene ?? null

  return (
    <div className="gai-backdrop" onClick={handleBackdrop}>
      <div className="gai-card">
        <div className="gai-header">
          <span>
            <i className="mdi mdi-google" />
            {structured ? 'Структурный анализ Gemini' : 'Google AI Analysis'}
          </span>
          <button className="gai-close" onClick={onClose}>×</button>
        </div>

        <div className="gai-body">
          <div className="gai-section">
            <div className="gai-label">Промпт</div>
            <textarea
              className="gai-prompt-area"
              value={prompt}
              onChange={handlePromptChange}
              rows={structured ? 12 : 4}
              disabled={running}
            />
          </div>

          <div className="gai-run-row">
            <div className="gai-run-info">
              <i className="mdi mdi-image-multiple-outline" />
              {fileIds.length} фото
              <span className="gai-run-model">{model}</span>
              {!apiKey && <span className="gai-no-key"> · нет API key</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {taskContext && structured && (
                <button
                  className="gai-run-btn"
                  style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', borderColor: 'rgba(99,102,241,0.3)' }}
                  onClick={handleSendToTask}
                  disabled={running || !apiKey}
                  title="Отправить в очередь задач (обработает весь период, по одному фото)"
                >
                  <i className="mdi mdi-tray-arrow-down" /> В задачи
                </button>
              )}
              <button
                className="gai-run-btn"
                onClick={handleRun}
                disabled={running || !apiKey}
              >
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

          {result && (
            <div className="gai-stats">
              <span><i className="mdi mdi-timer-outline" /> {(result.elapsed_ms / 1000).toFixed(1)} s</span>
              <span><i className="mdi mdi-image-outline" /> {result.images_used}</span>
              <span><i className="mdi mdi-counter" /> {result.total_tokens.toLocaleString()} tok</span>
              <span className="gai-stats-detail">in {result.input_tokens.toLocaleString()} · out {result.output_tokens.toLocaleString()}</span>
              <span><i className="mdi mdi-currency-usd" /> ${result.cost_usd.toFixed(6)}</span>
              {structured && result.saved_count > 0 && (
                <span className="gai-saved-badge">
                  <i className="mdi mdi-database-check-outline" /> {result.saved_count} сохранено
                </span>
              )}
            </div>
          )}

          {error && (
            <div className="gai-error">
              <i className="mdi mdi-alert-circle-outline" /> {error}
            </div>
          )}

          {/* Structured response */}
          {structured && parsedScene && (
            <div className="gai-response">
              <div className="gai-response-label">
                <i className="mdi mdi-image-filter-hdr-outline" /> Общая сцена
              </div>
              <div className="gai-response-text gai-scene-text">{parsedScene}</div>
            </div>
          )}
          {structured && parsedImages && (
            <div className="gai-response">
              <div className="gai-response-label">
                <i className="mdi mdi-format-list-numbered" /> Анализ по снимкам ({parsedImages.length})
              </div>
              <div className="gai-images-list">
                {parsedImages.map((img, i) => (
                  <div key={i} className="gai-image-entry">
                    <div className="gai-image-idx">#{i + 1}</div>
                    <div className="gai-image-content">
                      <div className="gai-image-desc">{img.description}</div>
                      {img.objects?.length > 0 && (
                        <div className="gai-image-objects">
                          {img.objects.map((o, j) => <span key={j} className="gai-obj-tag">{o}</span>)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Free-text response */}
          {!structured && result && (
            <div className="gai-response">
              <div className="gai-response-label">Ответ</div>
              <div className="gai-response-text">{result.text}</div>
            </div>
          )}

          {/* Fallback raw text if JSON parse failed in structured mode */}
          {structured && result && !parsedScene && result.raw_text && (
            <div className="gai-response">
              <div className="gai-response-label">Ответ (raw — не удалось разобрать JSON)</div>
              <div className="gai-response-text">{result.raw_text}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
