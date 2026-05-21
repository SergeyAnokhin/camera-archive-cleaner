import { useState } from 'react'
import {
  GEMINI_API_KEY_KEY, GEMINI_MODEL_KEY, GEMINI_DEFAULT_MODEL,
  GEMINI_PROMPT_KEY, GEMINI_DEFAULT_PROMPT, GEMINI_MODELS, GEMINI_PRICING,
} from './settingsConfig.js'

export default function GoogleAiTab() {
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem(GEMINI_API_KEY_KEY) || '')
  const [geminiModel, setGeminiModel]   = useState(() => localStorage.getItem(GEMINI_MODEL_KEY) || GEMINI_DEFAULT_MODEL)
  const [geminiPrompt, setGeminiPrompt] = useState(() => localStorage.getItem(GEMINI_PROMPT_KEY) || GEMINI_DEFAULT_PROMPT)

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

  const selectedModelPricing = GEMINI_PRICING[geminiModel]

  return (
    <>
      {/* API key */}
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

      {/* Model */}
      <div className="modal-section">
        <div className="modal-section-title">Model</div>
        <select className="modal-select" value={geminiModel} onChange={handleGeminiModelChange}>
          {GEMINI_MODELS.map(m => (
            <option key={m.value} value={m.value}>{m.tier}  {m.label}</option>
          ))}
        </select>
        {selectedModelPricing && (
          <div className="modal-setting-hint">
            Pricing: input ${selectedModelPricing.input.toFixed(2)} / output ${selectedModelPricing.output.toFixed(2)} per 1M tokens
          </div>
        )}
      </div>

      {/* Prompt */}
      <div className="modal-section">
        <div className="modal-section-title">Structured prompt template</div>
        <textarea
          className="modal-textarea"
          rows={10}
          value={geminiPrompt}
          onChange={handleGeminiPromptChange}
        />
        <div className="modal-setting-hint"><code style={{fontFamily:'monospace'}}>{'{n}'}</code> заменяется на количество снимков при запуске. Промт редактируется перед каждым запуском в окне анализа.</div>
      </div>
    </>
  )
}
