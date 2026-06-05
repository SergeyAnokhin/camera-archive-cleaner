import { useState } from 'react'
import { OBJECT_EMOJI_DEFAULTS } from '../../aiHelpers.js'
import { COCO_CLASSES, DETECTION_CLASSES_DEFAULT } from '../../cocoClasses.js'
import SliderSetting from './SliderSetting.jsx'
import {
  OV_CONFIDENCE_KEY, OV_CONFIDENCE_DEFAULT,
  EXCLUDED_OBJECTS_KEY, EMOJI_OVERRIDES_KEY, DETECTION_CLASSES_KEY,
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

function loadExcludedText() {
  try {
    const raw = localStorage.getItem(EXCLUDED_OBJECTS_KEY)
    return raw ? JSON.parse(raw).join('\n') : ''
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

export default function DetectionTab() {
  const [ovConfidence, setOvConfidence] = useState(loadOvConfidence)
  const [excludedText, setExcludedText] = useState(loadExcludedText)
  const [emojiText, setEmojiText]       = useState(loadEmojiOverridesText)
  const [classes, setClasses]           = useState(loadDetectionClasses)

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

  function handleExcludedChange(e) {
    setExcludedText(e.target.value)
    const arr = e.target.value.split(/[\n,]/).map(s => s.trim().toLowerCase()).filter(Boolean)
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

  return (
    <>
      <SliderSetting
        title="OpenVINO — default confidence threshold"
        min={10} max={80} step={5}
        value={ovConfidence} onChange={handleOvConfidenceChange}
        minLabel="10%" maxLabel="80%"
        valueLabel={`${ovConfidence}%`}
        hint="Минимальная уверенность детекции объекта. Применяется при следующем открытии режима OpenVINO."
      />

      {/* Detected YOLO classes */}
      <div className="modal-section">
        <div className="modal-section-title">Объекты для детекции (YOLO)</div>
        <div className="modal-setting-hint" style={{ marginBottom: 6 }}>
          YOLO ищет только отмеченные объекты ({classes.size} из {COCO_CLASSES.length}) — остальные классы игнорируются на этапе распознавания. Применяется при следующем открытии режима OpenVINO.
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <button className="modal-btn neutral" onClick={() => saveClasses(new Set(COCO_CLASSES.map(c => c.id)))}>Все</button>
          <button className="modal-btn neutral" onClick={() => saveClasses(new Set())}>Ничего</button>
          <button className="modal-btn neutral" onClick={() => saveClasses(new Set(DETECTION_CLASSES_DEFAULT))}>
            <i className="mdi mdi-restore" /> По умолчанию
          </button>
        </div>
        <div className="detection-emoji-grid">
          {COCO_CLASSES.map(c => (
            <label key={c.id} className="detection-class-row" title={`${c.en} (id ${c.id})`}>
              <input type="checkbox" checked={classes.has(c.id)} onChange={() => toggleClass(c.id)} />
              <span className="detection-emoji-char">{c.emoji}</span>
              <span className="detection-emoji-label">{c.ru}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Excluded objects */}
      <div className="modal-section">
        <div className="modal-section-title">Исключённые объекты</div>
        <textarea
          className="modal-textarea"
          rows={5}
          placeholder={'человек\nмашина\nптица'}
          value={excludedText}
          onChange={handleExcludedChange}
        />
        <div className="modal-setting-hint">По одному объекту на строку (или через запятую). Совпадения игнорируются при отображении и сводке страницы. Регистр не важен.</div>
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
    </>
  )
}
