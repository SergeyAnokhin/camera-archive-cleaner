import { useState } from 'react'
import { geminiAnalyzeBatch } from '../api.js'
import { STRUCTURED_ANALYSIS_TEMPLATE } from '../prompts.js'
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

// taskContext: { cameraId, dateFrom, dateTo } — if provided, shows "Send to Task" button
export default function GeminiAnalysisModal({ fileIds, onClose, onComplete, taskContext, onTaskCreated }) {
  const apiKey = localStorage.getItem(GEMINI_API_KEY_KEY) || ''
  const model  = localStorage.getItem(GEMINI_MODEL_KEY)  || GEMINI_DEFAULT_MODEL

  const [prompt, setPrompt] = useState(() => buildStructuredPrompt(fileIds.length))
  const [running, setRunning] = useState(false)
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState(null)

  async function handleRun() {
    if (!apiKey) {
      setError('No API key set. Open Tools → AI.')
      return
    }
    setRunning(true)
    setResult(null)
    setError(null)
    try {
      const data = await geminiAnalyzeBatch({ fileIds, prompt, model, apiKey })
      setResult(data)
      if (data.saved_count > 0) onComplete?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <BaseAiModal
      icon="mdi-google"
      title="Structured analysis (Gemini)"
      onClose={onClose}
      fileCount={fileIds.length} model={model} showNoKey={!apiKey}
      beforeRunRow={
        <div className="gai-section">
          <div className="gai-label">Prompt</div>
          <textarea
            className="gai-prompt-area"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={12}
            disabled={running}
          />
        </div>
      }
      running={running} onRun={handleRun} runDisabled={running || !apiKey}
      task={taskContext ? {
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
        title: 'Send to the task queue (processes the whole period, one photo at a time)',
      } : null}
      onTaskCreated={onTaskCreated}
    >
      <AiStatsRow result={result} />

      {error && (
        <div className="gai-error">
          <i className="mdi mdi-alert-circle-outline" /> {error}
        </div>
      )}

      <StructuredResponse result={result} />
    </BaseAiModal>
  )
}
