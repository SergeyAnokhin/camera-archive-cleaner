import { useState, useEffect } from 'react'
import { ollamaAnalyzeBatch } from '../api.js'
import { OLLAMA_SINGLE_IMAGE_TEMPLATE } from '../prompts.js'
import './GeminiAnalysisModal.css'

const OLLAMA_BASE_URL_KEY  = 'ollama_base_url'
const OLLAMA_MODEL_KEY     = 'ollama_model'
const OLLAMA_PROMPT_KEY    = 'ollama_single_image_prompt'
const OLLAMA_DEFAULT_URL   = 'http://localhost:11434'
const OLLAMA_DEFAULT_MODEL = 'gemma3:4b'

export default function OllamaAnalysisModal({ fileIds, onClose, onComplete }) {
  const baseUrl = localStorage.getItem(OLLAMA_BASE_URL_KEY) || OLLAMA_DEFAULT_URL
  const model   = localStorage.getItem(OLLAMA_MODEL_KEY)    || OLLAMA_DEFAULT_MODEL

  const [prompt, setPrompt]   = useState(() => localStorage.getItem(OLLAMA_PROMPT_KEY) || OLLAMA_SINGLE_IMAGE_TEMPLATE)
  const [running, setRunning] = useState(false)
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  async function handleRun() {
    if (!baseUrl) {
      setError('Base URL не задан. Откройте Tools → Ollama.')
      return
    }
    setRunning(true)
    setResult(null)
    setError(null)
    try {
      const data = await ollamaAnalyzeBatch({ fileIds, prompt, model, baseUrl })
      setResult(data)
      if (data.saved_count > 0) onComplete?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose()
  }

  const parsedImages = result?.parsed?.images ?? null

  return (
    <div className="gai-backdrop" onClick={handleBackdrop}>
      <div className="gai-card">
        <div className="gai-header">
          <span>
            <i className="mdi mdi-server-network" />
            Локальный анализ Ollama
          </span>
          <button className="gai-close" onClick={onClose}>×</button>
        </div>

        <div className="gai-body">
          <div className="gai-section">
            <div className="gai-label">Промпт (на каждый снимок)</div>
            <textarea
              className="gai-prompt-area"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={12}
              disabled={running}
            />
          </div>

          <div className="gai-run-row">
            <div className="gai-run-info">
              <i className="mdi mdi-image-multiple-outline" />
              {fileIds.length} фото
              <span className="gai-run-model">{model}</span>
              <span className="gai-run-model">{baseUrl}</span>
            </div>
            <button
              className="gai-run-btn"
              onClick={handleRun}
              disabled={running}
            >
              {running
                ? <><i className="mdi mdi-loading mdi-spin" /> Анализ…</>
                : <><i className="mdi mdi-play" /> Запустить</>
              }
            </button>
          </div>

          {result && (
            <div className="gai-stats">
              <span><i className="mdi mdi-timer-outline" /> {(result.elapsed_ms / 1000).toFixed(1)} s</span>
              <span><i className="mdi mdi-image-outline" /> {result.images_used}</span>
              <span><i className="mdi mdi-cash-remove" /> бесплатно (локально)</span>
              {result.saved_count > 0 && (
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

          {parsedImages && (
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
        </div>
      </div>
    </div>
  )
}
