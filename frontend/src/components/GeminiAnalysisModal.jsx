import { useState } from 'react'
import { geminiAnalyze, geminiAnalyzeBatch } from '../api.js'
import { STRUCTURED_ANALYSIS_TEMPLATE, GEMINI_FREEFORM_PROMPT } from '../prompts.js'
import BaseAiModal from './aiModal/BaseAiModal.jsx'
import { AiStatsRow, StructuredResponse } from './aiModal/StructuredAiResult.jsx'

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
  const [running, setRunning] = useState(false)
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState(null)

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

  return (
    <BaseAiModal
      icon="mdi-google"
      title={structured ? 'Структурный анализ Gemini' : 'Google AI Analysis'}
      onClose={onClose}
      fileCount={fileIds.length} model={model} showNoKey={!apiKey}
      beforeRunRow={
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
      }
      running={running} onRun={handleRun} runDisabled={running || !apiKey}
      task={taskContext && structured ? {
        type: 'gemini',
        params: {
          camera_id: taskContext.cameraId,
          date_from: taskContext.dateFrom,
          date_to: taskContext.dateTo,
          model,
          api_key: apiKey,
        },
        label: `Gemini · ${taskContext.dateFrom?.slice(0, 16) ?? ''}`,
        disabled: running || !apiKey,
        title: 'Отправить в очередь задач (обработает весь период, по одному фото)',
      } : null}
      onTaskCreated={onTaskCreated}
    >
      <AiStatsRow result={result} />

      {error && (
        <div className="gai-error">
          <i className="mdi mdi-alert-circle-outline" /> {error}
        </div>
      )}

      {structured && <StructuredResponse result={result} />}

      {/* Free-text response */}
      {!structured && result && (
        <div className="gai-response">
          <div className="gai-response-label">Ответ</div>
          <div className="gai-response-text">{result.text}</div>
        </div>
      )}
    </BaseAiModal>
  )
}
