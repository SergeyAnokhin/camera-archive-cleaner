import { useState } from 'react'
import {
  CLAUDE_API_KEY_KEY, CLAUDE_MODEL_KEY, CLAUDE_DEFAULT_MODEL,
  CLAUDE_MODELS, CLAUDE_PRICING,
} from './settingsConfig.js'

export default function ClaudeAiTab() {
  const [claudeApiKey, setClaudeApiKey] = useState(() => localStorage.getItem(CLAUDE_API_KEY_KEY) || '')
  const [claudeModel, setClaudeModel]   = useState(() => localStorage.getItem(CLAUDE_MODEL_KEY) || CLAUDE_DEFAULT_MODEL)

  function handleClaudeApiKeyChange(e) {
    setClaudeApiKey(e.target.value)
    localStorage.setItem(CLAUDE_API_KEY_KEY, e.target.value)
  }
  function handleClaudeModelChange(e) {
    setClaudeModel(e.target.value)
    localStorage.setItem(CLAUDE_MODEL_KEY, e.target.value)
  }

  const selectedClaudePricing = CLAUDE_PRICING[claudeModel]

  return (
    <>
      {/* API key */}
      <div className="modal-section">
        <div className="modal-section-title">API Key</div>
        <input
          type="password"
          className="modal-text-input"
          placeholder="sk-ant-..."
          value={claudeApiKey}
          onChange={handleClaudeApiKeyChange}
          autoComplete="off"
        />
        <div className="modal-setting-hint">
          Anthropic API key. Get it at <span className="modal-link">console.anthropic.com</span>
        </div>
      </div>

      {/* Model */}
      <div className="modal-section">
        <div className="modal-section-title">Model</div>
        <select className="modal-select" value={claudeModel} onChange={handleClaudeModelChange}>
          {CLAUDE_MODELS.map(m => (
            <option key={m.value} value={m.value}>{m.tier}  {m.label}</option>
          ))}
        </select>
        {selectedClaudePricing && (
          <div className="modal-setting-hint">
            Pricing: input ${selectedClaudePricing.input.toFixed(2)} / output ${selectedClaudePricing.output.toFixed(2)} per 1M tokens
          </div>
        )}
      </div>
    </>
  )
}
