import { useState, useEffect } from 'react'
import { getStatsTotal, getCameraDateRange } from '../api.js'
import './NewTaskModal.css'

const VIDEO_MODES = [
  { value: 'four_frames',    label: '2×2 grid (4 frames)' },
  { value: 'first_frame',    label: 'First frame' },
  { value: 'last_frame',     label: 'Last frame' },
  { value: 'max_change_gif', label: 'Max-change GIF' },
]

const OPENVINO_MODELS = [
  { value: 'yolov8n', label: 'YOLOv8n — nano (fast)' },
  { value: 'yolov8s', label: 'YOLOv8s — small' },
  { value: 'yolov8m', label: 'YOLOv8m — medium (accurate)' },
]

function toLocalInput(isoStr) {
  // "2024-11-01T00:00:00" → "2024-11-01T00:00"
  return isoStr ? isoStr.slice(0, 16) : ''
}

function nowLocalInput() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function monthStartInput() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-01T00:00`
}

export default function NewTaskModal({ cameras, onAdd, onClose }) {
  const [type, setType]               = useState('video_thumbnails')
  const [cameraId, setCameraId]       = useState(cameras[0]?.id ?? '')
  const [dateFrom, setDateFrom]       = useState(monthStartInput())
  const [dateTo, setDateTo]           = useState(nowLocalInput())
  const [thumbMode, setThumbMode]     = useState('four_frames')
  const [model, setModel]             = useState('yolov8n')
  const [confidence, setConfidence]   = useState(0.25)
  const [estimate, setEstimate]       = useState(null)
  const [loading, setLoading]         = useState(false)
  const [datesFromCamera, setDatesFromCamera] = useState(false)

  // When camera changes, auto-set date range from camera's actual data
  useEffect(() => {
    if (!cameraId) return
    getCameraDateRange(cameraId)
      .then(range => {
        if (range.date_from && range.date_to) {
          setDateFrom(toLocalInput(range.date_from))
          setDateTo(toLocalInput(range.date_to))
          setDatesFromCamera(true)
        } else {
          setDatesFromCamera(false)
        }
      })
      .catch(() => setDatesFromCamera(false))
  }, [cameraId])

  // Fetch file count estimate when camera/dates change
  useEffect(() => {
    if (!cameraId || !dateFrom || !dateTo) { setEstimate(null); return }
    const from = dateFrom + ':00'
    const to   = dateTo   + ':00'
    getStatsTotal(cameraId, from, to)
      .then(d => setEstimate({ photos: d.photo_count ?? 0, videos: d.video_count ?? 0 }))
      .catch(() => setEstimate(null))
  }, [cameraId, dateFrom, dateTo])

  function buildLabel() {
    const cam = cameras.find(c => c.id === cameraId)
    return `${cam?.name || cameraId} / ${dateFrom.slice(0,10)} – ${dateTo.slice(0,10)}`
  }

  async function handleAdd() {
    setLoading(true)
    try {
      const from = dateFrom + ':00'
      const to   = dateTo   + ':00'
      const params = { camera_id: cameraId, date_from: from, date_to: to }
      if (type === 'video_thumbnails') params.thumb_mode = thumbMode
      if (type === 'openvino') { params.model_name = model; params.confidence = confidence }
      await onAdd({ type, params, label: buildLabel() })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const fileCount = estimate
    ? (type === 'video_thumbnails' ? estimate.videos : estimate.photos)
    : null

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card ntm">
        <div className="modal-header">
          <span><i className="mdi mdi-plus-circle-outline" /> New Task</span>
          <button className="modal-close" onClick={onClose}><i className="mdi mdi-close" /></button>
        </div>

        <div className="ntm__body">

          {/* ── Task type ─────────────────────────────────────── */}
          <div className="ntm__section">
            <div className="ntm__label">Task type</div>
            <div className="ntm__type-grid">
              <button
                className={`ntm__type-card${type === 'video_thumbnails' ? ' ntm__type-card--active' : ''}`}
                onClick={() => setType('video_thumbnails')}
              >
                <i className="mdi mdi-video-outline ntm__type-icon" />
                <span className="ntm__type-name">Video Thumbnails</span>
                <span className="ntm__type-desc">Generate preview images for videos in a date range</span>
              </button>
              <button
                className={`ntm__type-card${type === 'openvino' ? ' ntm__type-card--active' : ''}`}
                onClick={() => setType('openvino')}
              >
                <i className="mdi mdi-magnify-scan ntm__type-icon" />
                <span className="ntm__type-name">OpenVINO Detection</span>
                <span className="ntm__type-desc">Run YOLO object detection on photos in a date range</span>
              </button>
            </div>
          </div>

          {/* ── Camera ────────────────────────────────────────── */}
          <div className="ntm__section ntm__row">
            <label className="ntm__label">Camera</label>
            <select className="modal-select ntm__select"
              value={cameraId} onChange={e => setCameraId(e.target.value)}>
              {cameras.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* ── Date range ────────────────────────────────────── */}
          <div className="ntm__section ntm__row">
            <div className="ntm__date-header">
              <label className="ntm__label" style={{margin:0}}>Date range</label>
              {datesFromCamera && (
                <span className="ntm__date-hint">
                  <i className="mdi mdi-check-circle" style={{fontSize:12,marginRight:3}} />
                  auto-filled from camera data
                </span>
              )}
            </div>
            <div className="ntm__dates">
              <input type="datetime-local" className="modal-text-input ntm__date-input"
                value={dateFrom} onChange={e => { setDateFrom(e.target.value); setDatesFromCamera(false) }} />
              <span className="ntm__date-sep">→</span>
              <input type="datetime-local" className="modal-text-input ntm__date-input"
                value={dateTo} onChange={e => { setDateTo(e.target.value); setDatesFromCamera(false) }} />
            </div>
          </div>

          {/* ── Type-specific params ──────────────────────────── */}
          {type === 'video_thumbnails' && (
            <div className="ntm__section ntm__row">
              <label className="ntm__label">Preview mode</label>
              <select className="modal-select ntm__select" value={thumbMode}
                onChange={e => setThumbMode(e.target.value)}>
                {VIDEO_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          )}
          {type === 'openvino' && (
            <>
              <div className="ntm__section ntm__row">
                <label className="ntm__label">Model</label>
                <select className="modal-select ntm__select" value={model}
                  onChange={e => setModel(e.target.value)}>
                  {OPENVINO_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="ntm__section ntm__row">
                <label className="ntm__label">Confidence</label>
                <div className="ntm__slider-row">
                  <input type="range" min="0.1" max="0.9" step="0.05"
                    value={confidence} onChange={e => setConfidence(parseFloat(e.target.value))}
                    className="ntm__slider" />
                  <span className="ntm__slider-val">{confidence.toFixed(2)}</span>
                </div>
              </div>
            </>
          )}

          {/* ── Estimate ─────────────────────────────────────── */}
          {fileCount != null && fileCount > 0 && (
            <div className="ntm__estimate">
              <i className="mdi mdi-information-outline" />
              <strong>{fileCount.toLocaleString()}</strong>
              &nbsp;{type === 'video_thumbnails' ? 'videos' : 'photos'} in this range
            </div>
          )}
          {fileCount === 0 && (
            <div className="ntm__warn">
              <i className="mdi mdi-alert-outline" />
              No {type === 'video_thumbnails' ? 'videos' : 'photos'} found in this range
            </div>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────── */}
        <div className="ntm__footer">
          <button className="modal-btn neutral" onClick={onClose}>Cancel</button>
          <button className="modal-btn accent" onClick={handleAdd}
            disabled={loading || !cameraId || fileCount === 0}>
            {loading
              ? <><i className="mdi mdi-loading mdi-spin" /> Adding…</>
              : <><i className="mdi mdi-plus" /> Add to Queue</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
