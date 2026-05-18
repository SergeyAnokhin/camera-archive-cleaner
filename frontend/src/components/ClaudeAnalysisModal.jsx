import { useState, useEffect } from 'react'
import { claudeAnalyzeBatch } from '../api.js'
import './GeminiAnalysisModal.css'

const CLAUDE_API_KEY_KEY   = 'claude_api_key'
const CLAUDE_MODEL_KEY     = 'claude_model'
const CLAUDE_DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

function buildStructuredPrompt(n) {
  return `Ты анализируешь ${n} снимк${n === 1 ? '' : n < 5 ? 'а' : 'ов'} с камеры видеонаблюдения.

Шаг 1 — ОБЩАЯ СЦЕНА: Опиши в 1-2 предложениях СТАТИЧНЫЙ фон, который присутствует на всех снимках постоянно (здания, ограждения, ландшафт, постоянные объекты).

Шаг 2 — ДЛЯ КАЖДОГО ИЗ ${n} СНИМКОВ предоставь:
  - description: 2-3 предложения о том, что конкретно происходит на ЭТОМ снимке (не повторяй фон, фокусируйся на изменениях и событиях).
  - objects: массив обнаруженных ДИНАМИЧЕСКИХ объектов. Используй короткие слова: "человек", "кошка", "собака", "птица", "машина", "грузовик", "велосипед", "мотоцикл", "дождь", "снег", "паук", "лиса", "пакет". Исключи статичный фон. Если ничего динамического нет — [].

Ответь СТРОГО в формате JSON (без markdown, без пояснений):
{
  "scene": "...",
  "images": [
    {"description": "...", "objects": ["человек", "машина"]},
    ...
  ]
}`
}

export default function ClaudeAnalysisModal({ fileIds, onClose, onComplete }) {
  const apiKey = localStorage.getItem(CLAUDE_API_KEY_KEY) || ''
  const model  = localStorage.getItem(CLAUDE_MODEL_KEY)  || CLAUDE_DEFAULT_MODEL

  const [prompt, setPrompt]     = useState(() => buildStructuredPrompt(fileIds.length))
  const [running, setRunning]   = useState(false)
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleRun() {
    if (!apiKey) {
      setError('API key не задан. Откройте Tools → Claude AI.')
      return
    }
    setRunning(true)
    setResult(null)
    setError(null)
    try {
      const data = await claudeAnalyzeBatch({ fileIds, prompt, model, apiKey })
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
  const parsedScene  = result?.parsed?.scene ?? null

  return (
    <div className="gai-backdrop" onClick={handleBackdrop}>
      <div className="gai-card">
        <div className="gai-header">
          <span>
            <i className="mdi mdi-robot" />
            Структурный анализ Claude
          </span>
          <button className="gai-close" onClick={onClose}>×</button>
        </div>

        <div className="gai-body">
          <div className="gai-section">
            <div className="gai-label">Промпт</div>
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
              {!apiKey && <span className="gai-no-key"> · нет API key</span>}
            </div>
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

          {result && (
            <div className="gai-stats">
              <span><i className="mdi mdi-timer-outline" /> {(result.elapsed_ms / 1000).toFixed(1)} s</span>
              <span><i className="mdi mdi-image-outline" /> {result.images_used}</span>
              <span><i className="mdi mdi-counter" /> {result.total_tokens.toLocaleString()} tok</span>
              <span className="gai-stats-detail">in {result.input_tokens.toLocaleString()} · out {result.output_tokens.toLocaleString()}</span>
              <span><i className="mdi mdi-currency-usd" /> ${result.cost_usd.toFixed(6)}</span>
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

          {parsedScene && (
            <div className="gai-response">
              <div className="gai-response-label">
                <i className="mdi mdi-image-filter-hdr-outline" /> Общая сцена
              </div>
              <div className="gai-response-text gai-scene-text">{parsedScene}</div>
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

          {result && !parsedScene && result.raw_text && (
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
