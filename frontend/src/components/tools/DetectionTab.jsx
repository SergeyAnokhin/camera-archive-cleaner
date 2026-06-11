import { useState } from 'react'
import { COCO_CLASSES, DETECTION_CLASSES_DEFAULT } from '../../cocoClasses.js'
import SliderSetting from './SliderSetting.jsx'
import {
  OV_CONFIDENCE_KEY, OV_CONFIDENCE_DEFAULT, DETECTION_CLASSES_KEY,
  OV_MODEL_KEY, OV_MODEL_DEFAULT, OV_MODELS,
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

export default function DetectionTab() {
  const [ovConfidence, setOvConfidence] = useState(loadOvConfidence)
  const [ovModel, setOvModel]           = useState(() => localStorage.getItem(OV_MODEL_KEY) || OV_MODEL_DEFAULT)
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

  function handleOvModelChange(e) {
    const v = e.target.value
    setOvModel(v)
    localStorage.setItem(OV_MODEL_KEY, v)
  }

  return (
    <>
      <div className="modal-section">
        <div className="modal-section-title">Detection — YOLO model</div>
        <div className="modal-setting-hint" style={{ marginBottom: 6 }}>
          Model used for object detection. Applied on the next detection run.
        </div>
        <select className="modal-select" value={ovModel} onChange={handleOvModelChange}
          style={{ width: '100%' }}>
          {OV_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      <SliderSetting
        title="Detection — confidence threshold"
        min={10} max={80} step={5}
        value={ovConfidence} onChange={handleOvConfidenceChange}
        minLabel="10%" maxLabel="80%"
        valueLabel={`${ovConfidence}%`}
        hint="Minimum detection confidence per object. Applied the next time the detection mode is opened."
      />

      {/* Detected YOLO classes */}
      <div className="modal-section">
        <div className="modal-section-title">Objects to detect (YOLO)</div>
        <div className="modal-setting-hint" style={{ marginBottom: 6 }}>
          YOLO looks only for the checked objects ({classes.size} of {COCO_CLASSES.length}) — other classes are skipped at inference time. Applied the next time the detection mode is opened.
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
            <label key={c.id} className="detection-class-row" title={`${c.en} (id ${c.id})`}>
              <input type="checkbox" checked={classes.has(c.id)} onChange={() => toggleClass(c.id)} />
              <span className="detection-emoji-char">{c.emoji}</span>
              <span className="detection-emoji-label">{c.ru}</span>
            </label>
          ))}
        </div>
      </div>
    </>
  )
}
