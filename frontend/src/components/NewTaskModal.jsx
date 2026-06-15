import { useState, useEffect } from 'react'
import {
  getStatsTotal, getCameraDateRange, getFileEstimate, getClassesList,
  getGoogleAuthStatus, getGmailLabels,
} from '../api.js'
import {
  toLocalInput, nowLocalInput, monthStartInput, isAiType, isDbType, isGoogleType,
  readGlobalSettings, VIDEO_MODE_LABELS, TASK_TYPES,
} from './newTask/newTaskHelpers.js'
import VideoConvertPanel from './newTask/VideoConvertPanel.jsx'
import FileOrganizerPanel from './newTask/FileOrganizerPanel.jsx'
import GmailDownloadPanel from './newTask/GmailDownloadPanel.jsx'
import GDriveUploadPanel from './newTask/GDriveUploadPanel.jsx'
import './NewTaskModal.css'

export default function NewTaskModal({ cameras, onAdd, onClose }) {
  const [type, setType]         = useState('video_thumbnails')
  const [cameraId, setCameraId] = useState(cameras[0]?.id ?? '')
  const [dateFrom, setDateFrom] = useState(monthStartInput())
  const [dateTo, setDateTo]     = useState(nowLocalInput())
  const [delayMin, setDelayMin] = useState(0)
  const [delayMax, setDelayMax] = useState(0)
  const [useTimeWindow, setUseTimeWindow]     = useState(false)
  const [activeFromHour, setActiveFromHour]   = useState(0)
  const [activeToHour, setActiveToHour]       = useState(8)
  const [reprocessExisting, setReprocessExisting] = useState(false)
  const [estimate, setEstimate]               = useState(null)
  const [loading, setLoading]                 = useState(false)
  const [datesFromCamera, setDatesFromCamera] = useState(false)

  // video_convert params (panel: newTask/VideoConvertPanel.jsx)
  const [vc, setVc] = useState({
    inputPattern: '*.mp4', outputSuffix: '_web', outputExtension: 'mp4',
    codec: 'libx265', crf: 30, preset: 'medium', dryRun: false,
    dateFrom: '', dateTo: '',
  })
  const patchVc = p => setVc(v => ({ ...v, ...p }))

  // file_organizer params (panel: newTask/FileOrganizerPanel.jsx)
  const [fo, setFo] = useState({
    sourceType: 'snapshots', inputPattern: '*.jpg', outputFolder: 'organized',
    dateRegex: '(\\d{4})(\\d{2})(\\d{2})', dryRun: false,
    dateFrom: '', dateTo: '',
  })
  const patchFo = p => setFo(v => ({ ...v, ...p }))

  // gmail_download params (panel: newTask/GmailDownloadPanel.jsx)
  const [gm, setGm] = useState({ labelId: '', dateFrom: '', dateTo: '', outputFolder: '', organizeByDate: true, subjectObjectRegex: '^(\\w+)\\s+Detected', repeatEveryHours: 0 })
  const patchGm = p => setGm(v => ({ ...v, ...p }))

  // gdrive_upload params (panel: newTask/GDriveUploadPanel.jsx)
  const [gd, setGd] = useState({ fileType: 'photo', driveFolder: 'CameraCleaner', dateFrom: '', dateTo: '' })
  const patchGd = p => setGd(v => ({ ...v, ...p }))

  // Google account state for the two google task types
  const [googleStatus, setGoogleStatus] = useState(null) // {connected, email} | null
  const [gmailLabels, setGmailLabels]   = useState(null)
  const [gdEstimate, setGdEstimate]     = useState(null)

  // shared: whether vc/fo date fields were auto-filled from camera range
  const [vcFoDatesFromCamera, setVcFoDatesFromCamera] = useState(false)

  // dynamic file count estimate for video_convert / file_organizer
  const [vcFoFileCount, setVcFoFileCount]               = useState(null)
  const [vcFoFileCountLoading, setVcFoFileCountLoading] = useState(false)

  const settings = readGlobalSettings()
  const geminiApiKey = localStorage.getItem('gemini_api_key') || ''
  const claudeApiKey = localStorage.getItem('claude_api_key') || ''

  // Auto-fill date range for DB task types
  useEffect(() => {
    if (!cameraId || !isDbType(type)) return
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
  }, [cameraId, type])

  // Auto-fill date range for video_convert, file_organizer and gdrive_upload (from camera's indexed files)
  useEffect(() => {
    if (!cameraId || !['video_convert', 'file_organizer', 'gdrive_upload'].includes(type)) return
    getCameraDateRange(cameraId)
      .then(range => {
        if (range.date_from && range.date_to) {
          const from = toLocalInput(range.date_from)
          const to   = toLocalInput(range.date_to)
          patchVc({ dateFrom: from, dateTo: to })
          patchFo({ dateFrom: from, dateTo: to })
          patchGd({ dateFrom: from, dateTo: to })
          setVcFoDatesFromCamera(true)
        } else {
          setVcFoDatesFromCamera(false)
        }
      })
      .catch(() => setVcFoDatesFromCamera(false))
  }, [cameraId, type])

  // Google account status + Gmail labels for the google task types
  useEffect(() => {
    if (!isGoogleType(type) || googleStatus !== null) return
    getGoogleAuthStatus().then(setGoogleStatus).catch(() => setGoogleStatus({ connected: false }))
  }, [type, googleStatus])

  useEffect(() => {
    if (type !== 'gmail_download' || !googleStatus?.connected || gmailLabels !== null) return
    getGmailLabels().then(d => setGmailLabels(d.labels)).catch(() => setGmailLabels([]))
  }, [type, googleStatus, gmailLabels])

  // File-count estimate for gdrive_upload (from the files table)
  useEffect(() => {
    if (type !== 'gdrive_upload' || !cameraId || !gd.dateFrom || !gd.dateTo) { setGdEstimate(null); return }
    getStatsTotal(cameraId, gd.dateFrom + ':00', gd.dateTo + ':00')
      .then(d => setGdEstimate({ photos: d.photo_count ?? 0, videos: d.video_count ?? 0 }))
      .catch(() => setGdEstimate(null))
  }, [cameraId, type, gd.dateFrom, gd.dateTo])

  useEffect(() => {
    if (!cameraId || !dateFrom || !dateTo || !isDbType(type)) { setEstimate(null); return }
    const from = dateFrom + ':00'
    const to   = dateTo   + ':00'
    getStatsTotal(cameraId, from, to)
      .then(d => setEstimate({ photos: d.photo_count ?? 0, videos: d.video_count ?? 0 }))
      .catch(() => setEstimate(null))
  }, [cameraId, dateFrom, dateTo, type])

  // Dynamic file count for video_convert / file_organizer (filesystem scan, debounced)
  useEffect(() => {
    if (type !== 'video_convert' && type !== 'file_organizer') {
      setVcFoFileCount(null)
      setVcFoFileCountLoading(false)
      return
    }
    if (!cameraId) { setVcFoFileCount(null); return }

    const isVc = type === 'video_convert'
    setVcFoFileCountLoading(true)
    const timer = setTimeout(() => {
      getFileEstimate({
        cameraId,
        taskType:     type,
        inputPattern: isVc ? vc.inputPattern : fo.inputPattern,
        dateFrom:     (isVc ? vc.dateFrom : fo.dateFrom) ? (isVc ? vc.dateFrom : fo.dateFrom) + ':00' : null,
        dateTo:       (isVc ? vc.dateTo   : fo.dateTo)   ? (isVc ? vc.dateTo   : fo.dateTo)   + ':00' : null,
        outputSuffix: isVc ? vc.outputSuffix : null,
      })
        .then(d => { setVcFoFileCount(d.file_count); setVcFoFileCountLoading(false) })
        .catch(() => { setVcFoFileCount(null);        setVcFoFileCountLoading(false) })
    }, 600)
    return () => clearTimeout(timer)
  }, [cameraId, type, vc.inputPattern, vc.dateFrom, vc.dateTo, vc.outputSuffix,
      fo.inputPattern, fo.dateFrom, fo.dateTo])

  function buildLabel() {
    const cam = cameras.find(c => c.id === cameraId)
    if (type === 'video_convert') {
      const ext = vc.outputExtension || 'mp4'
      return `Video Convert · ${cam?.name || cameraId} · ${vc.inputPattern} → ${vc.outputSuffix}.${ext}`
    }
    if (type === 'file_organizer') {
      return `File Organizer · ${cam?.name || cameraId} · ${fo.inputPattern} → ${fo.outputFolder}/`
    }
    if (type === 'gmail_download') {
      const labelName = gmailLabels?.find(l => l.id === gm.labelId)?.name || gm.labelId
      return `Gmail Download · ${labelName} → ${cam?.name || cameraId}`
    }
    if (type === 'gdrive_upload') {
      return `Drive Upload · ${cam?.name || cameraId} → ${gd.driveFolder}`
    }
    const typeName = { video_thumbnails: 'Video', openvino: 'YOLO', gemini: 'Gemini', claude: 'Claude' }[type] || type
    return `${typeName} · ${cam?.name || cameraId} · ${dateFrom.slice(0,10)} – ${dateTo.slice(0,10)}`
  }

  async function handleAdd() {
    setLoading(true)
    try {
      const params = { camera_id: cameraId }

      if (isDbType(type)) {
        const from = dateFrom + ':00'
        const to   = dateTo   + ':00'
        params.date_from = from
        params.date_to   = to
        params.eta_window_minutes = settings.etaWindowMinutes
        if (reprocessExisting) params.reprocess_existing = true
      }

      if (type === 'video_thumbnails') {
        params.thumb_mode = settings.videoMode
      } else if (type === 'openvino') {
        params.model_name = settings.ovModel
        params.confidence = settings.ovConf / 100
        params.classes    = getClassesList()
      } else if (type === 'gemini') {
        params.model   = settings.geminiModel
        params.api_key = geminiApiKey
        if (delayMax > 0) { params.delay_min_sec = delayMin; params.delay_max_sec = delayMax }
        if (useTimeWindow) { params.active_from_hour = activeFromHour; params.active_to_hour = activeToHour }
      } else if (type === 'claude') {
        params.model   = settings.claudeModel
        params.api_key = claudeApiKey
        if (delayMax > 0) { params.delay_min_sec = delayMin; params.delay_max_sec = delayMax }
        if (useTimeWindow) { params.active_from_hour = activeFromHour; params.active_to_hour = activeToHour }
      } else if (type === 'video_convert') {
        params.input_pattern    = vc.inputPattern
        params.output_suffix    = vc.outputSuffix
        params.output_extension = vc.outputExtension.replace(/^\./, '')
        params.codec            = vc.codec
        params.crf              = vc.crf
        params.preset           = vc.preset
        params.dry_run          = vc.dryRun
        if (vc.dateFrom) params.date_from = vc.dateFrom + ':00'
        if (vc.dateTo)   params.date_to   = vc.dateTo   + ':00'
      } else if (type === 'file_organizer') {
        params.source_type    = fo.sourceType
        params.input_pattern  = fo.inputPattern
        params.output_folder  = fo.outputFolder
        params.date_regex     = fo.dateRegex
        params.dry_run        = fo.dryRun
        if (fo.dateFrom) params.date_from = fo.dateFrom + ':00'
        if (fo.dateTo)   params.date_to   = fo.dateTo   + ':00'
      } else if (type === 'gmail_download') {
        params.label_id   = gm.labelId
        params.label_name = gmailLabels?.find(l => l.id === gm.labelId)?.name || gm.labelId
        if (gm.organizeByDate) params.organize_by_date = true
        if (gm.subjectObjectRegex.trim()) params.subject_object_regex = gm.subjectObjectRegex.trim()
        if (gm.outputFolder.trim()) params.output_folder = gm.outputFolder.trim()
        if (gm.dateFrom) params.date_from = gm.dateFrom + ':00'
        if (gm.dateTo)   params.date_to   = gm.dateTo   + ':00'
        if (gm.repeatEveryHours > 0) params.repeat_every_hours = gm.repeatEveryHours
      } else if (type === 'gdrive_upload') {
        params.file_type    = gd.fileType
        params.drive_folder = gd.driveFolder.trim()
        if (gd.dateFrom) params.date_from = gd.dateFrom + ':00'
        if (gd.dateTo)   params.date_to   = gd.dateTo   + ':00'
      }

      await onAdd({ type, params, label: buildLabel() })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const fileCount = estimate
    ? (type === 'video_thumbnails' ? estimate.videos : estimate.photos)
    : null

  const noApiKey = (type === 'gemini' && !geminiApiKey) || (type === 'claude' && !claudeApiKey)
  const isNewType = type === 'video_convert' || type === 'file_organizer' || isGoogleType(type)
  const googleNotConnected = isGoogleType(type) && googleStatus !== null && !googleStatus.connected
  const googleIncomplete = isGoogleType(type) && (
    !googleStatus?.connected
    || (type === 'gmail_download' && !gm.labelId)
    || (type === 'gdrive_upload' && !gd.driveFolder.trim())
  )


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
              {TASK_TYPES.map(t => (
                <button key={t.type}
                  className={`ntm__type-card${type === t.type ? ' ntm__type-card--active' : ''}`}
                  onClick={() => setType(t.type)}>
                  <i className={`mdi ${t.icon} ntm__type-icon`} />
                  <span className="ntm__type-name">{t.name}</span>
                  <span className="ntm__type-desc">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Active settings summary (read-only, DB tasks only) ── */}
          {!isNewType && (
            <div className="ntm__section ntm__settings-summary">
              <div className="ntm__label">Settings (from Tools)</div>
              {type === 'video_thumbnails' && (
                <div className="ntm__summary-row">
                  <i className="mdi mdi-cog-outline" />
                  <span>Preview mode: <strong>{VIDEO_MODE_LABELS[settings.videoMode] || settings.videoMode}</strong></span>
                </div>
              )}
              {type === 'openvino' && (
                <div className="ntm__summary-row">
                  <i className="mdi mdi-cog-outline" />
                  <span>Model: <strong>{settings.ovModel}</strong> · Confidence: <strong>{settings.ovConf}%</strong></span>
                </div>
              )}
              {type === 'gemini' && (
                <div className="ntm__summary-row">
                  <i className="mdi mdi-cog-outline" />
                  <span>Model: <strong>{settings.geminiModel}</strong></span>
                </div>
              )}
              {type === 'claude' && (
                <div className="ntm__summary-row">
                  <i className="mdi mdi-cog-outline" />
                  <span>Model: <strong>{settings.claudeModel}</strong></span>
                </div>
              )}
            </div>
          )}

          {/* ── Camera ────────────────────────────────────────── */}
          <div className="ntm__section ntm__row">
            <label className="ntm__label">Camera</label>
            <select className="modal-select ntm__select"
              value={cameraId} onChange={e => setCameraId(e.target.value)}>
              {cameras.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* ── Date range (DB tasks) ──────────────────────────── */}
          {isDbType(type) && (
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
          )}

          {/* ── API key warning ───────────────────────────────── */}
          {noApiKey && (
            <div className="ntm__warn">
              <i className="mdi mdi-alert-outline" />
              No {type === 'gemini' ? 'Gemini' : 'Claude'} API key set. Open Tools → AI.
            </div>
          )}

          {/* ── AI scheduling options ─────────────────────────── */}
          {isAiType(type) && (
            <>
              <div className="ntm__section">
                <div className="ntm__label">Pause between AI requests</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'calc(var(--font-base) * 0.85)', color: 'var(--text-dim)' }}>min:</span>
                  <input type="number" min="0" max="60" step="1" value={delayMin}
                    onChange={e => { const v = +e.target.value; setDelayMin(v); if (delayMax < v) setDelayMax(v) }}
                    className="modal-text-input" style={{ width: 70 }} />
                  <span style={{ fontSize: 'calc(var(--font-base) * 0.85)', color: 'var(--text-dim)' }}>max:</span>
                  <input type="number" min="0" max="60" step="1" value={delayMax}
                    onChange={e => { const v = +e.target.value; setDelayMax(v); if (delayMin > v) setDelayMin(v) }}
                    className="modal-text-input" style={{ width: 70 }} />
                  <span style={{ fontSize: 'calc(var(--font-base) * 0.82)', color: 'var(--text-dim)' }}>sec (0 = no pause)</span>
                </div>
              </div>

              <div className="ntm__section">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={useTimeWindow}
                    onChange={e => setUseTimeWindow(e.target.checked)}
                    style={{ accentColor: 'var(--accent)', width: 14, height: 14 }} />
                  <span className="ntm__label" style={{ margin: 0 }}>Limit run hours</span>
                </label>
                {useTimeWindow && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'calc(var(--font-base) * 0.85)', color: 'var(--text-dim)' }}>from</span>
                    <input type="number" min="0" max="23" step="1" value={activeFromHour}
                      onChange={e => setActiveFromHour(+e.target.value)}
                      className="modal-text-input" style={{ width: 60 }} />
                    <span style={{ fontSize: 'calc(var(--font-base) * 0.85)', color: 'var(--text-dim)' }}>to</span>
                    <input type="number" min="0" max="23" step="1" value={activeToHour}
                      onChange={e => setActiveToHour(+e.target.value)}
                      className="modal-text-input" style={{ width: 60 }} />
                    <span style={{ fontSize: 'calc(var(--font-base) * 0.82)', color: 'var(--text-dim)' }}>hours</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Reprocess existing (DB tasks only) ───────────── */}
          {isDbType(type) && (
            <div className="ntm__section">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={reprocessExisting}
                  onChange={e => setReprocessExisting(e.target.checked)}
                  style={{ accentColor: 'var(--accent)', width: 14, height: 14 }} />
                <span className="ntm__label" style={{ margin: 0 }}>Overwrite existing analysis</span>
              </label>
              <div style={{ fontSize: 'calc(var(--font-base) * 0.82)', color: 'var(--text-dim)', marginTop: 4, paddingLeft: 22 }}>
                {reprocessExisting
                  ? 'All files will be processed again, even if they already have analysis.'
                  : 'Files that already have analysis will be skipped (default).'}
              </div>
            </div>
          )}

          {/* ── Estimate (DB tasks only) ─────────────────────── */}
          {isDbType(type) && fileCount != null && fileCount > 0 && (
            <div className="ntm__estimate">
              <i className="mdi mdi-information-outline" />
              <strong>{fileCount.toLocaleString()}</strong>
              &nbsp;{type === 'video_thumbnails' ? 'videos' : 'photos'} in this range
            </div>
          )}
          {isDbType(type) && fileCount === 0 && (
            <div className="ntm__warn">
              <i className="mdi mdi-alert-outline" />
              No {type === 'video_thumbnails' ? 'videos' : 'photos'} found in this range
            </div>
          )}

          {type === 'video_convert' && (
            <VideoConvertPanel vc={vc} patch={patchVc}
              datesFromCamera={vcFoDatesFromCamera}
              onDatesEdited={() => setVcFoDatesFromCamera(false)}
              countLoading={vcFoFileCountLoading} count={vcFoFileCount} />
          )}

          {type === 'file_organizer' && (
            <FileOrganizerPanel fo={fo} patch={patchFo}
              datesFromCamera={vcFoDatesFromCamera}
              onDatesEdited={() => setVcFoDatesFromCamera(false)}
              countLoading={vcFoFileCountLoading} count={vcFoFileCount} />
          )}

          {googleNotConnected && (
            <div className="ntm__warn">
              <i className="mdi mdi-alert-outline" />
              Google account not connected.&nbsp;
              <a href="#" style={{ color: 'inherit' }}
                onClick={e => {
                  e.preventDefault()
                  window.dispatchEvent(new CustomEvent('open-tools', { detail: { tab: 'google' } }))
                  onClose()
                }}>
                Open Tools → Google
              </a>
            </div>
          )}

          {type === 'gmail_download' && (
            <GmailDownloadPanel gm={gm} patch={patchGm}
              labels={gmailLabels} connected={!!googleStatus?.connected} />
          )}

          {type === 'gdrive_upload' && (
            <GDriveUploadPanel gd={gd} patch={patchGd}
              datesFromCamera={vcFoDatesFromCamera}
              onDatesEdited={() => setVcFoDatesFromCamera(false)}
              estimate={gdEstimate} />
          )}

        </div>

        {/* ── Footer ───────────────────────────────────────────── */}
        <div className="ntm__footer">
          <button className="modal-btn neutral" onClick={onClose}>Cancel</button>
          <button className="modal-btn accent" onClick={handleAdd}
            disabled={loading || !cameraId || (isDbType(type) && fileCount === 0) || (isAiType(type) && noApiKey) || googleIncomplete}>
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
