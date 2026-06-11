import { useState } from 'react'
import {
  GEMINI_API_KEY_KEY, GEMINI_MODEL_KEY, GEMINI_DEFAULT_MODEL,
  GEMINI_PROMPT_KEY, GEMINI_DEFAULT_PROMPT, GEMINI_MODELS, GEMINI_PRICING,
  CLAUDE_API_KEY_KEY, CLAUDE_MODEL_KEY, CLAUDE_DEFAULT_MODEL,
  CLAUDE_MODELS, CLAUDE_PRICING,
} from './settingsConfig.js'

export default function AiTab() {
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem(GEMINI_API_KEY_KEY) || '')
  const [geminiModel, setGeminiModel]   = useState(() => localStorage.getItem(GEMINI_MODEL_KEY) || GEMINI_DEFAULT_MODEL)
  const [geminiPrompt, setGeminiPrompt] = useState(() => localStorage.getItem(GEMINI_PROMPT_KEY) || GEMINI_DEFAULT_PROMPT)
  const [claudeApiKey, setClaudeApiKey] = useState(() => localStorage.getItem(CLAUDE_API_KEY_KEY) || '')
  const [claudeModel, setClaudeModel]   = useState(() => localStorage.getItem(CLAUDE_MODEL_KEY) || CLAUDE_DEFAULT_MODEL)

  function handleGeminiApiKeyChange(e) {
    setGeminiApiKey(e.target.value)
    localStorage.setItem(GEMINI_API_KEY_KEY, e.target.value)
  }
  function handleGeminiModelChange(e) {
    setGeminiModel(e.target.value)
    localStorage.setItem(GEMINI_MODEL_KEY, e.target.value)
  }
  function handleGeminiPromptChange(e) {
    setGeminiPrompt(e.target.value)
    localStorage.setItem(GEMINI_PROMPT_KEY, e.target.value)
  }
  function handleClaudeApiKeyChange(e) {
    setClaudeApiKey(e.target.value)
    localStorage.setItem(CLAUDE_API_KEY_KEY, e.target.value)
  }
  function handleClaudeModelChange(e) {
    setClaudeModel(e.target.value)
    localStorage.setItem(CLAUDE_MODEL_KEY, e.target.value)
  }

  const geminiPricing = GEMINI_PRICING[geminiModel]
  const claudePricing = CLAUDE_PRICING[claudeModel]

  return (
    <>
      {/* ── Google AI ── */}
      <div className="modal-ai-provider-header">
        <i className="mdi mdi-google" /> Google AI (Gemini)
      </div>

      <div className="modal-section">
        <div className="modal-section-title">API Key</div>
        <input
          type="password"
          className="modal-text-input"
          placeholder="AIza..."
          value={geminiApiKey}
          onChange={handleGeminiApiKeyChange}
          autoComplete="off"
        />
        <div className="modal-setting-hint">
          Google AI Studio key. Get it at <span className="modal-link">aistudio.google.com</span>
        </div>
      </div>

      <div className="modal-section">
        <div className="modal-section-title">Model</div>
        <select className="modal-select" value={geminiModel} onChange={handleGeminiModelChange}>
          {GEMINI_MODELS.map(m => (
            <option key={m.value} value={m.value}>{m.tier}  {m.label}</option>
          ))}
        </select>
        {geminiPricing && (
          <div className="modal-setting-hint">
            Pricing: input ${geminiPricing.input.toFixed(2)} / output ${geminiPricing.output.toFixed(2)} per 1M tokens
          </div>
        )}
      </div>

      <div className="modal-section">
        <div className="modal-section-title">Structured prompt template</div>
        <textarea
          className="modal-textarea"
          rows={8}
          value={geminiPrompt}
          onChange={handleGeminiPromptChange}
        />
        <div className="modal-setting-hint"><code style={{fontFamily:'monospace'}}>{'{n}'}</code> заменяется на количество снимков при запуске. Промт редактируется перед каждым запуском в окне анализа.</div>
      </div>

      {/* ── Claude AI ── */}
      <div className="modal-ai-provider-header">
        <i className="mdi mdi-robot-outline" /> Claude AI (Anthropic)
      </div>

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

      <div className="modal-section">
        <div className="modal-section-title">Model</div>
        <select className="modal-select" value={claudeModel} onChange={handleClaudeModelChange}>
          {CLAUDE_MODELS.map(m => (
            <option key={m.value} value={m.value}>{m.tier}  {m.label}</option>
          ))}
        </select>
        {claudePricing && (
          <div className="modal-setting-hint">
            Pricing: input ${claudePricing.input.toFixed(2)} / output ${claudePricing.output.toFixed(2)} per 1M tokens
          </div>
        )}
      </div>
    </>
  )
}
