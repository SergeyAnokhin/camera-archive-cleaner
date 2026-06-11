import { useState } from 'react'
import { claudeAnalyzeBatch } from '../api.js'
import { STRUCTURED_ANALYSIS_TEMPLATE } from '../prompts.js'
import BaseAiModal from './aiModal/BaseAiModal.jsx'
import { AiStatsRow, StructuredResponse } from './aiModal/StructuredAiResult.jsx'

const CLAUDE_API_KEY_KEY   = 'claude_api_key'
const CLAUDE_MODEL_KEY     = 'claude_model'
const CLAUDE_DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

function buildStructuredPrompt(n) {
  return STRUCTURED_ANALYSIS_TEMPLATE.replace(/\{n\}/g, n)
}

// taskContext: { cameraId, dateFrom, dateTo } — if provided, shows "Send to Task" button
export default function ClaudeAnalysisModal({ fileIds, onClose, onComplete, taskContext, onTaskCreated }) {
  const apiKey = localStorage.getItem(CLAUDE_API_KEY_KEY) || ''
  const model  = localStorage.getItem(CLAUDE_MODEL_KEY)  || CLAUDE_DEFAULT_MODEL

  const [prompt, setPrompt]   = useState(() => buildStructuredPrompt(fileIds.length))
  const [running, setRunning] = useState(false)
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState(null)

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

  return (
    <BaseAiModal
      icon="mdi-robot"
      title="Структурный анализ Claude"
      onClose={onClose}
      fileCount={fileIds.length} model={model} showNoKey={!apiKey}
      beforeRunRow={
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
      }
      running={running} onRun={handleRun} runDisabled={running || !apiKey}
      task={taskContext ? {
        type: 'claude',
        params: {
          camera_id: taskContext.cameraId,
          date_from: taskContext.dateFrom,
          date_to: taskContext.dateTo,
          model,
          api_key: apiKey,
        },
        label: `Claude · ${taskContext.dateFrom?.slice(0, 16) ?? ''}`,
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

      <StructuredResponse result={result} />
    </BaseAiModal>
  )
}
