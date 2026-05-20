import { useState, useEffect, useRef } from 'react'
import { clearDatabase, clearAllThumbnails, getStorageInfo } from '../api.js'
import { OBJECT_EMOJI_DEFAULTS } from '../aiHelpers.js'
import * as yaml from 'js-yaml'
import './ToolsModal.css'

const FONT_KEY = 'font-base'
const FONT_MIN = 12
const FONT_MAX = 22
const FONT_DEFAULT = 15

const PREVIEWS_PER_CELL_KEY = 'previews_per_cell'
const PREVIEWS_PER_CELL_MIN = 0
const PREVIEWS_PER_CELL_MAX = 10
const PREVIEWS_PER_CELL_DEFAULT = 3

const PAGE_SIZE_KEY = 'hour_page_size'
const PAGE_SIZE_MIN = 10
const PAGE_SIZE_MAX = 200
const PAGE_SIZE_DEFAULT = 50

const ZOOM_KEY = 'hover_zoom'
const ZOOM_MIN = 1.0
const ZOOM_MAX = 3.0
const ZOOM_STEP = 0.25
const ZOOM_DEFAULT = 1.5

const THUMB_WIDTH_KEY     = 'thumb_width'
const THUMB_WIDTH_MIN     = 80
const THUMB_WIDTH_MAX     = 400
const THUMB_WIDTH_DEFAULT = 140

const DIFF_THRESHOLD_KEY     = 'diff_threshold'
const DIFF_THRESHOLD_MIN     = 0
const DIFF_THRESHOLD_MAX     = 100
const DIFF_THRESHOLD_DEFAULT = 20

const VIDEO_PREVIEW_KEY     = 'video_preview_mode'
const VIDEO_PREVIEW_DEFAULT = 'none'
const VIDEO_PREVIEW_OPTIONS = [
  { value: 'none',           label: 'Нет (иконка камеры)' },
  { value: 'first_frame',    label: 'Первый кадр' },
  { value: 'last_frame',     label: 'Последний кадр' },
  { value: 'four_frames',    label: '4 кадра (2×2 сетка)' },
  { value: 'max_change_gif', label: 'GIF — максимальное изменение' },
]

const GEMINI_API_KEY_KEY = 'gemini_api_key'
const GEMINI_MODEL_KEY   = 'gemini_model'
const GEMINI_PROMPT_KEY  = 'gemini_structured_prompt'
const GEMINI_DEFAULT_MODEL  = 'gemini-3.1-flash-lite'
const GEMINI_DEFAULT_PROMPT = `Ты анализируешь {n} снимков с камеры видеонаблюдения.

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

const CLAUDE_API_KEY_KEY   = 'claude_api_key'
const CLAUDE_MODEL_KEY     = 'claude_model'
const CLAUDE_DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

const CLAUDE_MODELS = [
  { value: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4-5',   tier: '🟢 lite' },
  { value: 'claude-sonnet-4-6',         label: 'claude-sonnet-4-6',  tier: '🟡 base' },
  { value: 'claude-opus-4-7',           label: 'claude-opus-4-7',    tier: '🔴 pro'  },
]

const CLAUDE_PRICING = {
  'claude-haiku-4-5-20251001': { input: 0.80,  output: 4.00  },
  'claude-sonnet-4-6':         { input: 3.00,  output: 15.00 },
  'claude-opus-4-7':           { input: 15.00, output: 75.00 },
}

const GEMINI_MODELS = [
  { value: 'gemini-3.1-flash-lite',    label: 'gemini-3.1-flash-lite',    tier: '🟢 lite' },
  { value: 'gemini-2.5-flash-lite',    label: 'gemini-2.5-flash-lite',    tier: '🟢 lite' },
  { value: 'gemini-2.5-flash',         label: 'gemini-2.5-flash',         tier: '🟡 base' },
  { value: 'gemini-3.1-flash-preview', label: 'gemini-3.1-flash-preview', tier: '🟡 base' },
  { value: 'gemini-3.5-flash',         label: 'gemini-3.5-flash',         tier: '🔴 pro'  },
  { value: 'gemini-2.5-pro',           label: 'gemini-2.5-pro',           tier: '🔴 pro'  },
  { value: 'gemini-3.1-pro-preview',   label: 'gemini-3.1-pro-preview',   tier: '🔴 pro'  },
]

const GEMINI_PRICING = {
  'gemini-3.1-flash-lite':    { input: 0.25,  output: 1.50  },
  'gemini-2.5-flash-lite':    { input: 0.10,  output: 0.40  },
  'gemini-2.5-flash':         { input: 0.30,  output: 2.50  },
  'gemini-3.1-flash-preview': { input: 0.50,  output: 3.00  },
  'gemini-3.5-flash':         { input: 1.50,  output: 9.00  },
  'gemini-2.5-pro':           { input: 1.25,  output: 10.00 },
  'gemini-3.1-pro-preview':   { input: 2.00,  output: 12.00 },
}

const OV_CONFIDENCE_KEY = 'mode_params_openvino'
const OV_CONFIDENCE_DEFAULT = 25
const EXCLUDED_OBJECTS_KEY = 'detection_excluded_objects'
const EMOJI_OVERRIDES_KEY  = 'detection_emoji_overrides'

function loadOvConfidence() {
  try {
    const raw = localStorage.getItem(OV_CONFIDENCE_KEY)
    return raw ? (JSON.parse(raw).confidence ?? OV_CONFIDENCE_DEFAULT) : OV_CONFIDENCE_DEFAULT
  } catch { return OV_CONFIDENCE_DEFAULT }
}

function loadExcludedText() {
  try {
    const raw = localStorage.getItem(EXCLUDED_OBJECTS_KEY)
    return raw ? JSON.parse(raw).join(', ') : ''
  } catch { return '' }
}

function loadEmojiOverridesText() {
  try {
    const raw = localStorage.getItem(EMOJI_OVERRIDES_KEY)
    if (!raw) return ''
    const obj = JSON.parse(raw)
    return Object.entries(obj).map(([k, v]) => `${k} = ${v}`).join('\n')
  } catch { return '' }
}

function parseEmojiOverridesText(text) {
  const result = {}
  for (const line of text.split('\n')) {
    const idx = line.indexOf('=')
    if (idx < 1) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    const val = line.slice(idx + 1).trim()
    if (key && val) result[key] = val
  }
  return result
}

const MOTION_MODE_KEYS = [
  'motion_diff', 'diff_zoom', 'erosion', 'neon_mask', 'mhi', 'bounding_boxes', 'motion_stacking'
]

function tryParseJSON(s) {
  try { return s ? JSON.parse(s) : null } catch { return null }
}

function collectSettings() {
  const motionModes = {}
  for (const m of MOTION_MODE_KEYS) {
    motionModes[m] = tryParseJSON(localStorage.getItem('mode_params_' + m)) || { threshold: DIFF_THRESHOLD_DEFAULT }
  }
  return {
    ui: {
      font_size:          Number(localStorage.getItem(FONT_KEY)) || FONT_DEFAULT,
      previews_per_cell:  Number(localStorage.getItem(PREVIEWS_PER_CELL_KEY) ?? PREVIEWS_PER_CELL_DEFAULT),
    },
    hour_view: {
      page_size:       Number(localStorage.getItem(PAGE_SIZE_KEY)) || PAGE_SIZE_DEFAULT,
      thumb_width:     Number(localStorage.getItem(THUMB_WIDTH_KEY)) || THUMB_WIDTH_DEFAULT,
      hover_zoom:      Number(localStorage.getItem(ZOOM_KEY)) || ZOOM_DEFAULT,
      diff_threshold:  Number(localStorage.getItem(DIFF_THRESHOLD_KEY) ?? DIFF_THRESHOLD_DEFAULT),
      view_mode:       localStorage.getItem('hour_view_mode') || 'normal',
    },
    motion_modes: motionModes,
    google_ai: {
      model:   localStorage.getItem(GEMINI_MODEL_KEY) || GEMINI_DEFAULT_MODEL,
      api_key: '# Get your key at aistudio.google.com',
      prompt:  localStorage.getItem(GEMINI_PROMPT_KEY) || GEMINI_DEFAULT_PROMPT,
    },
    claude_ai: {
      model:   localStorage.getItem(CLAUDE_MODEL_KEY) || CLAUDE_DEFAULT_MODEL,
      api_key: '# Get your key at console.anthropic.com',
    },
  }
}

function exportSettingsYaml() {
  const header = `# Camera Snapshots Cleaner — settings export\n# Generated: ${new Date().toISOString()}\n\n`
  const body = yaml.dump(collectSettings(), { lineWidth: 120, quotingType: '"' })
  const blob = new Blob([header + body], { type: 'text/yaml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'snapshots-settings.yaml'
  a.click()
  URL.revokeObjectURL(url)
}

function fmtBytes(b) {
  if (b == null) return null
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function applyFontSize(px) {
  document.documentElement.style.setProperty('--font-base', px + 'px')
}

export function initFontSize() {
  const saved = localStorage.getItem(FONT_KEY)
  if (saved) applyFontSize(Number(saved))
}

export default function ToolsModal({ onClose, onDatabaseCleared }) {
  const [fontSize, setFontSize] = useState(() => {
    return Number(localStorage.getItem(FONT_KEY)) || FONT_DEFAULT
  })
  const [previewsPerCell, setPreviewsPerCell] = useState(() => {
    const v = localStorage.getItem(PREVIEWS_PER_CELL_KEY)
    return v !== null ? Number(v) : PREVIEWS_PER_CELL_DEFAULT
  })
  const [pageSize, setPageSize] = useState(() => {
    return Number(localStorage.getItem(PAGE_SIZE_KEY)) || PAGE_SIZE_DEFAULT
  })
  const [hoverZoom, setHoverZoom] = useState(() => {
    return Number(localStorage.getItem(ZOOM_KEY)) || ZOOM_DEFAULT
  })
  const [thumbWidth, setThumbWidth] = useState(() => {
    return Number(localStorage.getItem(THUMB_WIDTH_KEY)) || THUMB_WIDTH_DEFAULT
  })
  const [diffThreshold, setDiffThreshold] = useState(() => {
    const v = localStorage.getItem(DIFF_THRESHOLD_KEY)
    return v !== null ? Number(v) : DIFF_THRESHOLD_DEFAULT
  })
  const [videoPreviewMode, setVideoPreviewMode] = useState(
    () => localStorage.getItem(VIDEO_PREVIEW_KEY) || VIDEO_PREVIEW_DEFAULT
  )
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem(GEMINI_API_KEY_KEY) || '')
  const [geminiModel, setGeminiModel]   = useState(() => localStorage.getItem(GEMINI_MODEL_KEY) || GEMINI_DEFAULT_MODEL)
  const [geminiPrompt, setGeminiPrompt] = useState(() => localStorage.getItem(GEMINI_PROMPT_KEY) || GEMINI_DEFAULT_PROMPT)
  const [claudeApiKey, setClaudeApiKey] = useState(() => localStorage.getItem(CLAUDE_API_KEY_KEY) || '')
  const [claudeModel, setClaudeModel]   = useState(() => localStorage.getItem(CLAUDE_MODEL_KEY) || CLAUDE_DEFAULT_MODEL)

  const [ovConfidence, setOvConfidence]   = useState(loadOvConfidence)
  const [excludedText, setExcludedText]   = useState(loadExcludedText)
  const [emojiText, setEmojiText]         = useState(loadEmojiOverridesText)

  const importRef = useRef(null)
  const [importResult, setImportResult] = useState(null)

  function applyImportedSettings(data) {
    if (!data || typeof data !== 'object') return 0
    let applied = 0

    function safeNum(val, min, max) {
      const n = Number(val)
      if (isNaN(n)) return null
      return Math.max(min, Math.min(max, n))
    }
    function safeStr(val, allowed) {
      if (typeof val !== 'string') return null
      return !allowed || allowed.includes(val) ? val : null
    }

    const fs = safeNum(data?.ui?.font_size, FONT_MIN, FONT_MAX)
    if (fs !== null) {
      localStorage.setItem(FONT_KEY, fs); setFontSize(fs); applyFontSize(fs)
      document.dispatchEvent(new CustomEvent('font-base-change', { detail: fs })); applied++
    }
    const ppc = safeNum(data?.ui?.previews_per_cell, PREVIEWS_PER_CELL_MIN, PREVIEWS_PER_CELL_MAX)
    if (ppc !== null) {
      localStorage.setItem(PREVIEWS_PER_CELL_KEY, ppc); setPreviewsPerCell(ppc)
      document.dispatchEvent(new CustomEvent('previews-per-cell-change', { detail: ppc })); applied++
    }
    const ps = safeNum(data?.hour_view?.page_size, PAGE_SIZE_MIN, PAGE_SIZE_MAX)
    if (ps !== null) {
      localStorage.setItem(PAGE_SIZE_KEY, ps); setPageSize(ps)
      document.dispatchEvent(new CustomEvent('hour-page-size-change', { detail: ps })); applied++
    }
    const tw = safeNum(data?.hour_view?.thumb_width, THUMB_WIDTH_MIN, THUMB_WIDTH_MAX)
    if (tw !== null) {
      localStorage.setItem(THUMB_WIDTH_KEY, tw); setThumbWidth(tw)
      document.dispatchEvent(new CustomEvent('thumb-width-change', { detail: tw })); applied++
    }
    const hz = safeNum(data?.hour_view?.hover_zoom, ZOOM_MIN, ZOOM_MAX)
    if (hz !== null) {
      localStorage.setItem(ZOOM_KEY, hz); setHoverZoom(hz)
      document.dispatchEvent(new CustomEvent('hover-zoom-change', { detail: hz })); applied++
    }
    const dt = safeNum(data?.hour_view?.diff_threshold, DIFF_THRESHOLD_MIN, DIFF_THRESHOLD_MAX)
    if (dt !== null) {
      localStorage.setItem(DIFF_THRESHOLD_KEY, dt); setDiffThreshold(dt)
      document.dispatchEvent(new CustomEvent('diff-threshold-change', { detail: dt })); applied++
    }
    const vm = safeStr(data?.hour_view?.view_mode)
    if (vm !== null) { localStorage.setItem('hour_view_mode', vm); applied++ }

    const mm = data?.motion_modes
    if (mm && typeof mm === 'object') {
      for (const key of MOTION_MODE_KEYS) {
        const t = safeNum(mm[key]?.threshold, DIFF_THRESHOLD_MIN, DIFF_THRESHOLD_MAX)
        if (t !== null) {
          localStorage.setItem('mode_params_' + key, JSON.stringify({ threshold: t })); applied++
        }
      }
    }

    const gModel = safeStr(data?.google_ai?.model)
    if (gModel) { localStorage.setItem(GEMINI_MODEL_KEY, gModel); setGeminiModel(gModel); applied++ }
    const gPrompt = safeStr(data?.google_ai?.prompt)
    if (gPrompt !== null) { localStorage.setItem(GEMINI_PROMPT_KEY, gPrompt); setGeminiPrompt(gPrompt); applied++ }

    const cModel = safeStr(data?.claude_ai?.model)
    if (cModel) { localStorage.setItem(CLAUDE_MODEL_KEY, cModel); setClaudeModel(cModel); applied++ }

    return applied
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = yaml.load(ev.target.result)
        const n = applyImportedSettings(data)
        setImportResult({ ok: true, text: `Imported ${n} settings.` })
      } catch (err) {
        setImportResult({ ok: false, text: `Parse error: ${err.message}` })
      }
    }
    reader.readAsText(file)
  }

  const [dbConfirm, setDbConfirm] = useState(false)
  const [dbBusy, setDbBusy]       = useState(false)
  const [dbResult, setDbResult]   = useState(null)
  const [thumbBusy, setThumbBusy]     = useState(false)
  const [thumbResult, setThumbResult] = useState(null)
  const [storageInfo, setStorageInfo] = useState(null)

  function handleFontChange(e) {
    const px = Number(e.target.value)
    setFontSize(px)
    applyFontSize(px)
    localStorage.setItem(FONT_KEY, px)
    document.dispatchEvent(new CustomEvent('font-base-change', { detail: px }))
  }

  function handlePreviewsPerCellChange(e) {
    const v = Number(e.target.value)
    setPreviewsPerCell(v)
    localStorage.setItem(PREVIEWS_PER_CELL_KEY, v)
    document.dispatchEvent(new CustomEvent('previews-per-cell-change', { detail: v }))
  }

  function handlePageSizeChange(e) {
    const raw = Number(e.target.value)
    const v = Math.max(PAGE_SIZE_MIN, Math.min(PAGE_SIZE_MAX, raw || PAGE_SIZE_DEFAULT))
    setPageSize(v)
    localStorage.setItem(PAGE_SIZE_KEY, v)
    document.dispatchEvent(new CustomEvent('hour-page-size-change', { detail: v }))
  }

  function handleHoverZoomChange(e) {
    const v = Number(e.target.value)
    setHoverZoom(v)
    localStorage.setItem(ZOOM_KEY, v)
    document.dispatchEvent(new CustomEvent('hover-zoom-change', { detail: v }))
  }

  function handleThumbWidthChange(e) {
    const v = Number(e.target.value)
    setThumbWidth(v)
    localStorage.setItem(THUMB_WIDTH_KEY, v)
    document.dispatchEvent(new CustomEvent('thumb-width-change', { detail: v }))
  }

  function handleDiffThresholdChange(e) {
    const v = Number(e.target.value)
    setDiffThreshold(v)
    localStorage.setItem(DIFF_THRESHOLD_KEY, v)
    document.dispatchEvent(new CustomEvent('diff-threshold-change', { detail: v }))
  }

  function handleVideoPreviewModeChange(e) {
    const v = e.target.value
    setVideoPreviewMode(v)
    localStorage.setItem(VIDEO_PREVIEW_KEY, v)
    document.dispatchEvent(new CustomEvent('video-preview-mode-change', { detail: v }))
  }

  async function handleClearDb() {
    if (!dbConfirm) { setDbConfirm(true); return }
    setDbBusy(true)
    setDbResult(null)
    try {
      await clearDatabase()
      setDbResult({ ok: true, text: 'Database cleared.' })
      onDatabaseCleared()
    } catch (e) {
      setDbResult({ ok: false, text: e.message })
    } finally {
      setDbBusy(false)
      setDbConfirm(false)
    }
  }

  async function handleClearThumbnails() {
    setThumbBusy(true)
    setThumbResult(null)
    try {
      const res = await clearAllThumbnails()
      setThumbResult({ ok: true, res })
      setStorageInfo(si => si ? { ...si, thumbnails_size_bytes: 0 } : si)
    } catch (e) {
      setThumbResult({ ok: false, text: e.message })
    } finally {
      setThumbBusy(false)
    }
  }

  function handleOvConfidenceChange(e) {
    const v = Number(e.target.value)
    setOvConfidence(v)
    const existing = (() => { try { return JSON.parse(localStorage.getItem(OV_CONFIDENCE_KEY) || '{}') } catch { return {} } })()
    localStorage.setItem(OV_CONFIDENCE_KEY, JSON.stringify({ ...existing, confidence: v }))
  }

  function handleExcludedChange(e) {
    setExcludedText(e.target.value)
    const arr = e.target.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    localStorage.setItem(EXCLUDED_OBJECTS_KEY, JSON.stringify(arr))
  }

  function handleEmojiTextChange(e) {
    setEmojiText(e.target.value)
    const obj = parseEmojiOverridesText(e.target.value)
    localStorage.setItem(EMOJI_OVERRIDES_KEY, JSON.stringify(obj))
  }

  function handleResetEmojiOverrides() {
    setEmojiText('')
    localStorage.removeItem(EMOJI_OVERRIDES_KEY)
  }

  const [activeTab, setActiveTab] = useState('general')

  useEffect(() => {
    if (activeTab !== 'maintenance') return
    getStorageInfo().then(setStorageInfo).catch(() => {})
  }, [activeTab])

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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

  const selectedModelPricing = GEMINI_PRICING[geminiModel]
  const selectedClaudePricing = CLAUDE_PRICING[claudeModel]

  const TABS = [
    { id: 'general',     label: 'General' },
    { id: 'hour_view',   label: 'Hour view' },
    { id: 'detection',   label: 'Detection' },
    { id: 'google_ai',   label: 'Google AI' },
    { id: 'claude_ai',   label: 'Claude AI' },
    { id: 'maintenance', label: 'Maintenance' },
  ]

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-card">
        <div className="modal-header">
          <span><i className="mdi mdi-wrench-outline" /> Tools</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`modal-tab${activeTab === t.id ? ' active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="modal-tab-content">

          {activeTab === 'general' && <>
            {/* Font size */}
            <div className="modal-section">
              <div className="modal-section-title">Font size</div>
              <div className="font-slider-row">
                <span className="font-size-label">A</span>
                <input type="range" min={FONT_MIN} max={FONT_MAX} step="1"
                  value={fontSize} onChange={handleFontChange} className="font-slider" />
                <span className="font-size-label large">A</span>
                <span className="font-size-value">{fontSize} px</span>
              </div>
            </div>

            {/* Previews per cell */}
            <div className="modal-section">
              <div className="modal-section-title">Preview thumbnails per cell</div>
              <div className="font-slider-row">
                <span className="font-size-label">0</span>
                <input type="range" min={PREVIEWS_PER_CELL_MIN} max={PREVIEWS_PER_CELL_MAX} step="1"
                  value={previewsPerCell} onChange={handlePreviewsPerCellChange} className="font-slider" />
                <span className="font-size-label">{PREVIEWS_PER_CELL_MAX}</span>
                <span className="font-size-value">{previewsPerCell}</span>
              </div>
              <div className="modal-setting-hint">Thumbnails shown inside each heatmap cell (year/month/day). Set 0 to disable.</div>
            </div>

            {/* Export / Import */}
            <div className="modal-section">
              <div className="modal-section-title">Settings file</div>
              <div className="modal-action-row">
                <button className="modal-btn neutral" onClick={exportSettingsYaml}>
                  <i className="mdi mdi-download-outline" /> Export YAML
                </button>
                <button className="modal-btn neutral" onClick={() => { setImportResult(null); importRef.current?.click() }}>
                  <i className="mdi mdi-upload-outline" /> Import YAML
                </button>
                <input ref={importRef} type="file" accept=".yaml,.yml" style={{ display: 'none' }} onChange={handleImportFile} />
              </div>
              <div className="modal-setting-hint">Export saves all settings to <code>snapshots-settings.yaml</code>. Import applies only recognised keys — unknown or invalid values are silently skipped.</div>
              {importResult && (
                <div className={`modal-result ${importResult.ok ? 'ok' : 'err'}`}>{importResult.text}</div>
              )}
            </div>
          </>}

          {activeTab === 'hour_view' && <>
            {/* Photos per page */}
            <div className="modal-section">
              <div className="modal-section-title">Photos per page</div>
              <div className="font-slider-row">
                <input type="number" min={PAGE_SIZE_MIN} max={PAGE_SIZE_MAX} step="10"
                  value={pageSize} onChange={handlePageSizeChange} className="modal-number-input" />
                <span className="font-size-value" style={{ marginLeft: 0 }}>per page</span>
              </div>
              <div className="modal-setting-hint">Number of items per page when browsing a specific hour ({PAGE_SIZE_MIN}–{PAGE_SIZE_MAX}).</div>
            </div>

            {/* Thumbnail width */}
            <div className="modal-section">
              <div className="modal-section-title">Thumbnail width</div>
              <div className="font-slider-row">
                <span className="font-size-label">{THUMB_WIDTH_MIN}</span>
                <input type="range" min={THUMB_WIDTH_MIN} max={THUMB_WIDTH_MAX} step="10"
                  value={thumbWidth} onChange={handleThumbWidthChange} className="font-slider" />
                <span className="font-size-label">{THUMB_WIDTH_MAX}</span>
                <span className="font-size-value">{thumbWidth} px</span>
              </div>
              <div className="modal-setting-hint">Minimum column width of photo cards.</div>
            </div>

            {/* Hover zoom */}
            <div className="modal-section">
              <div className="modal-section-title">Hover zoom</div>
              <div className="font-slider-row">
                <span className="font-size-label">1×</span>
                <input type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP}
                  value={hoverZoom} onChange={handleHoverZoomChange} className="font-slider" />
                <span className="font-size-label">{ZOOM_MAX}×</span>
                <span className="font-size-value">{hoverZoom.toFixed(2)}×</span>
              </div>
              <div className="modal-setting-hint">Scale factor when hovering a photo. Set to 1× to disable.</div>
            </div>

            {/* Motion diff threshold */}
            <div className="modal-section">
              <div className="modal-section-title">Motion diff — change threshold</div>
              <div className="font-slider-row">
                <span className="font-size-label">{DIFF_THRESHOLD_MIN}</span>
                <input type="range" min={DIFF_THRESHOLD_MIN} max={DIFF_THRESHOLD_MAX} step="1"
                  value={diffThreshold} onChange={handleDiffThresholdChange} className="font-slider" />
                <span className="font-size-label">{DIFF_THRESHOLD_MAX}</span>
                <span className="font-size-value">{diffThreshold}</span>
              </div>
              <div className="modal-setting-hint">Pixels with a channel delta below this value are darkened in Motion diff mode. Higher = only significant changes shown.</div>
            </div>

            {/* Video preview mode */}
            <div className="modal-section">
              <div className="modal-section-title">Превью видео</div>
              <select className="modal-select" value={videoPreviewMode} onChange={handleVideoPreviewModeChange}>
                {VIDEO_PREVIEW_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <div className="modal-setting-hint">
                Режим отображения превью для видеофайлов на карточках. GIF генерируется дольше и кешируется.
              </div>
            </div>
          </>}

          {activeTab === 'detection' && <>
            {/* OpenVINO confidence */}
            <div className="modal-section">
              <div className="modal-section-title">OpenVINO — default confidence threshold</div>
              <div className="font-slider-row">
                <span className="font-size-label">10%</span>
                <input type="range" min={10} max={80} step={5}
                  value={ovConfidence} onChange={handleOvConfidenceChange} className="font-slider" />
                <span className="font-size-label">80%</span>
                <span className="font-size-value">{ovConfidence}%</span>
              </div>
              <div className="modal-setting-hint">Минимальная уверенность детекции объекта. Применяется при следующем открытии режима OpenVINO.</div>
            </div>

            {/* Excluded objects */}
            <div className="modal-section">
              <div className="modal-section-title">Исключённые объекты</div>
              <input
                type="text"
                className="modal-text-input"
                placeholder="человек, машина, птица"
                value={excludedText}
                onChange={handleExcludedChange}
              />
              <div className="modal-setting-hint">Объекты через запятую. Совпадения игнорируются при отображении и сводке страницы. Регистр не важен.</div>
            </div>

            {/* Emoji overrides */}
            <div className="modal-section">
              <div className="modal-section-title">Emoji для объектов</div>
              <textarea
                className="modal-textarea"
                rows={7}
                placeholder={'собака = 🐩\nмашина = 🏎️\nperson = 🧑'}
                value={emojiText}
                onChange={handleEmojiTextChange}
              />
              <div className="modal-setting-hint">
                Формат: <code style={{fontFamily:'monospace'}}>метка = emoji</code>, по одному на строку. Переопределяет стандартные emoji только для указанных объектов.
              </div>
              <button className="modal-btn neutral" style={{marginTop:6}} onClick={handleResetEmojiOverrides}>
                <i className="mdi mdi-restore" /> Сбросить переопределения
              </button>
            </div>

            {/* Default emoji reference */}
            <div className="modal-section">
              <div className="modal-section-title">Стандартные emoji (справочник)</div>
              <div className="detection-emoji-grid">
                {Object.entries(OBJECT_EMOJI_DEFAULTS).map(([label, emoji]) => (
                  <div key={label} className="detection-emoji-row" title={label}>
                    <span className="detection-emoji-char">{emoji}</span>
                    <span className="detection-emoji-label">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </>}

          {activeTab === 'google_ai' && <>
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
          </>}

          {activeTab === 'claude_ai' && <>
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
          </>}

          {activeTab === 'maintenance' && <>
            {/* Clear database */}
            <div className="modal-section">
              <div className="modal-section-title">Danger zone</div>
              <div className="modal-action-row">
                <div className="modal-action-info">
                  <span className="modal-action-name">Clear database</span>
                  <span className="modal-action-desc">
                    Remove all scanned file records
                    {storageInfo && fmtBytes(storageInfo.db_size_bytes) &&
                      <span className="modal-action-size"> · {fmtBytes(storageInfo.db_size_bytes)}</span>
                    }
                  </span>
                </div>
                {dbConfirm ? (
                  <div className="modal-confirm-group">
                    <span className="modal-confirm-text">Sure?</span>
                    <button className="modal-btn danger" onClick={handleClearDb} disabled={dbBusy}>
                      {dbBusy ? <i className="mdi mdi-loading mdi-spin" /> : 'Yes, clear'}
                    </button>
                    <button className="modal-btn neutral" onClick={() => setDbConfirm(false)}>Cancel</button>
                  </div>
                ) : (
                  <button className="modal-btn danger-outline" onClick={handleClearDb}>
                    <i className="mdi mdi-database-remove-outline" /> Clear
                  </button>
                )}
              </div>
              {dbResult && (
                <div className={`modal-result ${dbResult.ok ? 'ok' : 'err'}`}>{dbResult.text}</div>
              )}
            </div>

            {/* Clear all thumbnails */}
            <div className="modal-section">
              <div className="modal-action-row">
                <div className="modal-action-info">
                  <span className="modal-action-name">Clear all thumbnails</span>
                  <span className="modal-action-desc">
                    Delete cached previews of all types (basic, diff, erosion, motion)
                    {storageInfo && storageInfo.thumbnails_size_bytes > 0 &&
                      <span className="modal-action-size"> · {fmtBytes(storageInfo.thumbnails_size_bytes)}</span>
                    }
                  </span>
                </div>
                <button className="modal-btn danger-outline" onClick={handleClearThumbnails} disabled={thumbBusy}>
                  {thumbBusy
                    ? <i className="mdi mdi-loading mdi-spin" />
                    : <><i className="mdi mdi-image-remove-outline" /> Clear</>
                  }
                </button>
              </div>
              {thumbResult && !thumbResult.ok && (
                <div className="modal-result err">{thumbResult.text}</div>
              )}
              {thumbResult?.ok && thumbResult.res && (() => {
                const t = thumbResult.res.types
                const total = thumbResult.res.total_files
                const freed = thumbResult.res.freed_bytes
                const parts = [
                  t.basic.deleted_files    && `basic: ${t.basic.deleted_files}`,
                  t.diff.deleted_files     && `diff: ${t.diff.deleted_files}`,
                  t.diff_zoom.deleted_files && `diff-zoom: ${t.diff_zoom.deleted_files}`,
                  t.erosion.deleted_files  && `erosion: ${t.erosion.deleted_files}`,
                  t.motion.deleted_files   && `motion: ${t.motion.deleted_files}`,
                ].filter(Boolean)
                return (
                  <div className="modal-result ok">
                    Deleted {total} {total === 1 ? 'file' : 'files'}
                    {parts.length > 0 && ` (${parts.join(', ')})`}
                    {freed > 0 && ` · freed ${fmtBytes(freed)}`}
                  </div>
                )
              })()}
            </div>
          </>}

        </div>
      </div>
    </div>
  )
}
