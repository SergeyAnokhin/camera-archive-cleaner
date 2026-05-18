import { useState, useEffect } from 'react'
import { geminiAnalyze, geminiAnalyzeBatch } from '../api.js'
import './GeminiAnalysisModal.css'

const GEMINI_API_KEY_KEY = 'gemini_api_key'
const GEMINI_MODEL_KEY   = 'gemini_model'
const GEMINI_PROMPT_KEY  = 'gemini_structured_prompt'
const GEMINI_DEFAULT_MODEL  = 'gemini-3.1-flash-lite'
const GEMINI_DEFAULT_PROMPT = 'Детально опиши, что происходит на этих снимках с камеры видеонаблюдения. Перечисли все заметные объекты, людей, транспортные средства и события.'

const FALLBACK_STRUCTURED_TEMPLATE = `Ты анализируешь {n} снимков с камеры видеонаблюдения.

Для каждого снимка:
- description: 1-2 предложения. Опиши ДИНАМИЧЕСКИЕ объекты и их взаимодействие или положение. Если очевидно, что объект что-то делает — укажи, но только при высокой уверенности. Фон и декорации не описывай.
- objects: массив коротких слов для динамических объектов. Используй максимально конкретные слова:
  • Люди: "мужчина", "женщина", "ребёнок", "мальчик", "девочка" — или "человек" если пол/возраст не определить.
  • Животные: "кошка", "собака", "птица", "курица", "кролик", "лиса", "белка", "конь", "корова", "ёж" и т.д. — НЕ пиши просто "животное".
  • Транспорт: "машина", "грузовик", "велосипед", "мотоцикл", "автобус".
  • Прочее: "дождь", "снег", "паук", "пакет".
  Пустой массив [], если динамических объектов нет.

scene: 1 предложение — что в целом происходит на этих {n} снимках (общая активность, не описание места).

Ответь СТРОГО JSON (без markdown, без пояснений):
{"scene": "...", "images": [{"description": "...", "objects": [...]}, ...]}`

function buildStructuredPrompt(n) {
  const template = localStorage.getItem(GEMINI_PROMPT_KEY) || FALLBACK_STRUCTURED_TEMPLATE
  return template.replace(/\{n\}/g, n)
}

// structured=true → structured prompt + JSON response + onComplete callback
// structured=false → free prompt, raw text (original behavior)
export default function GeminiAnalysisModal({ fileIds, onClose, structured = false, onComplete }) {
  const apiKey = localStorage.getItem(GEMINI_API_KEY_KEY) || ''
  const model  = localStorage.getItem(GEMINI_MODEL_KEY)  || GEMINI_DEFAULT_MODEL

  const [prompt, setPrompt] = useState(() =>
    structured
      ? buildStructuredPrompt(fileIds.length)
      : (localStorage.getItem('gemini_prompt') || GEMINI_DEFAULT_PROMPT)
  )
  const [running, setRunning]   = useState(false)
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
