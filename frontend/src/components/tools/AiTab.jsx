import { useState } from 'react'
import { COCO_CLASSES, DETECTION_CLASSES_DEFAULT } from '../../cocoClasses.js'
import SliderSetting from './SliderSetting.jsx'
import {
  OV_CONFIDENCE_KEY, OV_CONFIDENCE_DEFAULT, DETECTION_CLASSES_KEY,
  OV_MODEL_KEY, OV_MODEL_DEFAULT, OV_MODELS,
  GEMINI_API_KEY_KEY, GEMINI_MODEL_KEY, GEMINI_DEFAULT_MODEL,
  GEMINI_PROMPT_KEY, GEMINI_DEFAULT_PROMPT, GEMINI_MODELS, GEMINI_PRICING,
  CLAUDE_API_KEY_KEY, CLAUDE_MODEL_KEY, CLAUDE_DEFAULT_MODEL,
  CLAUDE_MODELS, CLAUDE_PRICING,
} from './settingsConfig.js'

function loadOvConfidence() {
  try {
    const raw = localStorage.getItem(OV_CONFIDENCE_KEY)
    return raw ? (JSON.parse(raw).confidence ?? OV_CONFIDENCE_DEFAULT) : OV_CONFIDENCE_DEFAULT
  } catch { return OV_CONFIDENCE_DEFAULT }
}

function loadDetectionClasses() {
  try {
    const raw = localStorage.getItem(DETECTION_CLASSES_KEY)
    return new Set(raw ? JSON.parse(raw) : DETECTION_CLASSES_DEFAULT)
  } catch { return new Set(DETECTION_CLASSES_DEFAULT) }
}

export default function AiTab() {
  // Detection state
  const [ovConfidence, setOvConfidence] = useState(loadOvConfidence)
  const [ovModel, setOvModel]           = useState(() => localStorage.getItem(OV_MODEL_KEY) || OV_MODEL_DEFAULT)
  const [classes, setClasses]           = useState(loadDetectionClasses)

  // Gemini state
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem(GEMINI_API_KEY_KEY) || '')
  const [geminiModel, setGeminiModel]   = useState(() => localStorage.getItem(GEMINI_MODEL_KEY) || GEMINI_DEFAULT_MODEL)
  const [geminiPrompt, setGeminiPrompt] = useState(() => localStorage.getItem(GEMINI_PROMPT_KEY) || GEMINI_DEFAULT_PROMPT)

  // Claude state
  const [claudeApiKey, setClaudeApiKey] = useState(() => localStorage.getItem(CLAUDE_API_KEY_KEY) || '')
  const [claudeModel, setClaudeModel]   = useState(() => localStorage.getItem(CLAUDE_MODEL_KEY) || CLAUDE_DEFAULT_MODEL)

  // Detection handlers
  function saveClasses(next) {
    setClasses(next)
    localStorage.setItem(DETECTION_CLASSES_KEY, JSON.stringify([...next].sort((a, b) => a - b)))
  }

  function toggleClass(id) {
    const next = new Set(classes)
    next.has(id) ? next.delete(id) : next.add(id)
    saveClasses(next)
  }

  function handleOvConfidenceChange(e) {
    const v = Number(e.target.value)
    setOvConfidence(v)
    const existing = (() => { try { return JSON.parse(localStorage.getItem(OV_CONFIDENCE_KEY) || '{}') } catch { return {} } })()
    localStorage.setItem(OV_CONFIDENCE_KEY, JSON.stringify({ ...existing, confidence: v }))
  }

  function handleOvModelChange(e) {
    const v = e.target.value
    setOvModel(v)
    localStorage.setItem(OV_MODEL_KEY, v)
  }

  // Gemini handlers
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

  // Claude handlers
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
      {/* ── Detection (YOLO / OpenVINO) ── */}
      <div className="modal-ai-provider-header">
        <i className="mdi mdi-eye-outline" /> Detection (YOLO)
      </div>

      <div className="modal-section">
        <div className="modal-section-title">YOLO model</div>
        <div className="modal-setting-hint" style={{ marginBottom: 6 }}>
          Model used for object detection. Applied on the next detection run.
        </div>
        <select className="modal-select" value={ovModel} onChange={handleOvModelChange}
          style={{ width: '100%' }}>
          {OV_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      <SliderSetting
        title="Confidence threshold"
        min={10} max={80} step={5}
        value={ovConfidence} onChange={handleOvConfidenceChange}
        minLabel="10%" maxLabel="80%"
        valueLabel={`${ovConfidence}%`}
        hint="Minimum detection confidence per object. Applied the next time the detection mode is opened."
      />

      <div className="modal-section">
        <div className="modal-section-title">Objects to detect</div>
        <div className="modal-setting-hint" style={{ marginBottom: 6 }}>
          YOLO looks only for the checked objects ({classes.size} of {COCO_CLASSES.length}) — other classes are skipped at inference time.
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <button className="modal-btn neutral" onClick={() => saveClasses(new Set(COCO_CLASSES.map(c => c.id)))}>All</button>
          <button className="modal-btn neutral" onClick={() => saveClasses(new Set())}>None</button>
          <button className="modal-btn neutral" onClick={() => saveClasses(new Set(DETECTION_CLASSES_DEFAULT))}>
            <i className="mdi mdi-restore" /> Defaults
          </button>
        </div>
        <div className="detection-emoji-grid">
          {COCO_CLASSES.map(c => (
            <label key={c.id} className="detection-class-row" title={`${c.ru} (id ${c.id})`}>
              <input type="checkbox" checked={classes.has(c.id)} onChange={() => toggleClass(c.id)} />
              <span className="detection-emoji-char">{c.emoji}</span>
              <span className="detection-emoji-label">{c.en}</span>
            </label>
          ))}
        </div>
      </div>

      {/* ── Google AI (Gemini) ── */}
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
        <div className="modal-setting-hint"><code style={{fontFamily:'monospace'}}>{'{n}'}</code> is replaced with the number of photos at run time. The prompt can be edited before each run in the analysis window.</div>
      </div>

      {/* ── Claude AI (Anthropic) ── */}
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
