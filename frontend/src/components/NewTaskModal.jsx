import { useState, useEffect } from 'react'
import { getStatsTotal, getCameraDateRange } from '../api.js'
import './NewTaskModal.css'

function toLocalInput(isoStr) {
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

function isAiType(type)  { return type === 'gemini' || type === 'claude' }
function isDbType(type)  { return ['video_thumbnails','openvino','gemini','claude'].includes(type) }

function readGlobalSettings() {
  const videoMode = localStorage.getItem('video_preview_mode') || 'four_frames'
  const ovModel   = localStorage.getItem('openvino_model') || 'yolov8n'
  const ovConf    = (() => {
    try { return JSON.parse(localStorage.getItem('mode_params_openvino_detection') || '{}').confidence ?? 25 }
    catch { return 25 }
  })()
  const geminiModel = localStorage.getItem('gemini_model') || 'gemini-3.1-flash-lite'
  const claudeModel = localStorage.getItem('claude_model') || 'claude-haiku-4-5-20251001'
  const etaWindowMinutes = Number(localStorage.getItem('eta_window_minutes')) || 5
  return { videoMode, ovModel, ovConf, geminiModel, claudeModel, etaWindowMinutes }
}

const VIDEO_MODE_LABELS = {
  'none':           'Нет (иконка камеры)',
  'first_frame':    'Первый кадр',
  'last_frame':     'Последний кадр',
  'four_frames':    '4 кадра (2×2)',
  'max_change_gif': 'GIF — 2 кадра (макс. изменение)',
  'four_frames_gif':'GIF — 4 кадра равномерно',
  'max_change_4_gif':'GIF — 4 кадра (макс. изменение)',
}

const VC_CODECS  = ['libx265', 'libx264', 'libvpx-vp9', 'copy']
const VC_PRESETS = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'veryslow']

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

  // ── video_convert params ─────────────────────────────────────
  const [vcInputPattern,    setVcInputPattern]    = useState('*.mp4')
  const [vcOutputSuffix,    setVcOutputSuffix]    = useState('_web')
  const [vcOutputExtension, setVcOutputExtension] = useState('mp4')
  const [vcCodec,           setVcCodec]           = useState('libx265')
  const [vcCrf,             setVcCrf]             = useState(30)
  const [vcPreset,          setVcPreset]          = useState('medium')
  const [vcDryRun,          setVcDryRun]          = useState(false)
  const [vcDateFrom,        setVcDateFrom]        = useState('')
  const [vcDateTo,          setVcDateTo]          = useState('')

  // ── file_organizer params ────────────────────────────────────
  const [foSourceType,   setFoSourceType]   = useState('snapshots')
  const [foInputPattern, setFoInputPattern] = useState('*.jpg')
  const [foOutputFolder, setFoOutputFolder] = useState('organized')
  const [foDateRegex,    setFoDateRegex]    = useState('(\\d{4})(\\d{2})(\\d{2})')
  const [foDryRun,       setFoDryRun]       = useState(false)
  const [foDateFrom,     setFoDateFrom]     = useState('')
  const [foDateTo,       setFoDateTo]       = useState('')

  // shared: whether vc/fo date fields were auto-filled from camera range
  const [vcFoDatesFromCamera, setVcFoDatesFromCamera] = useState(false)

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

  // Auto-fill date range for video_convert and file_organizer (from camera's indexed files)
  useEffect(() => {
    if (!cameraId || (type !== 'video_convert' && type !== 'file_organizer')) return
    getCameraDateRange(cameraId)
      .then(range => {
        if (range.date_from && range.date_to) {
          const from = toLocalInput(range.date_from)
          const to   = toLocalInput(range.date_to)
          setVcDateFrom(from)
          setVcDateTo(to)
          setFoDateFrom(from)
          setFoDateTo(to)
          setVcFoDatesFromCamera(true)
        } else {
          setVcFoDatesFromCamera(false)
        }
      })
      .catch(() => setVcFoDatesFromCamera(false))
  }, [cameraId, type])

  useEffect(() => {
    if (!cameraId || !dateFrom || !dateTo || !isDbType(type)) { setEstimate(null); return }
    const from = dateFrom + ':00'
    const to   = dateTo   + ':00'
    getStatsTotal(cameraId, from, to)
      .then(d => setEstimate({ photos: d.photo_count ?? 0, videos: d.video_count ?? 0 }))
      .catch(() => setEstimate(null))
  }, [cameraId, dateFrom, dateTo, type])

  function buildLabel() {
    const cam = cameras.find(c => c.id === cameraId)
    if (type === 'video_convert') {
      const ext = vcOutputExtension || 'mp4'
      return `Video Convert · ${cam?.name || cameraId} · ${vcInputPattern} → ${vcOutputSuffix}.${ext}`
    }
    if (type === 'file_organizer') {
      return `File Organizer · ${cam?.name || cameraId} · ${foInputPattern} → ${foOutputFolder}/`
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
        params.input_pattern    = vcInputPattern
        params.output_suffix    = vcOutputSuffix
        params.output_extension = vcOutputExtension.replace(/^\./, '')
        params.codec            = vcCodec
        params.crf              = vcCrf
        params.preset           = vcPreset
        params.dry_run          = vcDryRun
        if (vcDateFrom) params.date_from = vcDateFrom + ':00'
        if (vcDateTo)   params.date_to   = vcDateTo   + ':00'
      } else if (type === 'file_organizer') {
        params.source_type    = foSourceType
        params.input_pattern  = foInputPattern
        params.output_folder  = foOutputFolder
        params.date_regex     = foDateRegex
        params.dry_run        = foDryRun
        if (foDateFrom) params.date_from = foDateFrom + ':00'
        if (foDateTo)   params.date_to   = foDateTo   + ':00'
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
  const isNewType = type === 'video_convert' || type === 'file_organizer'

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
              <button className={`ntm__type-card${type === 'video_thumbnails' ? ' ntm__type-card--active' : ''}`}
                onClick={() => setType('video_thumbnails')}>
                <i className="mdi mdi-video-outline ntm__type-icon" />
                <span className="ntm__type-name">Video Thumbnails</span>
                <span className="ntm__type-desc">Превью для видео в диапазоне дат</span>
              </button>
              <button className={`ntm__type-card${type === 'openvino' ? ' ntm__type-card--active' : ''}`}
                onClick={() => setType('openvino')}>
                <i className="mdi mdi-magnify-scan ntm__type-icon" />
                <span className="ntm__type-name">OpenVINO Detection</span>
                <span className="ntm__type-desc">YOLO детекция объектов на фото</span>
              </button>
              <button className={`ntm__type-card${type === 'gemini' ? ' ntm__type-card--active' : ''}`}
                onClick={() => setType('gemini')}>
                <i className="mdi mdi-google ntm__type-icon" />
                <span className="ntm__type-name">Gemini AI Analysis</span>
                <span className="ntm__type-desc">Анализ фото с Google Gemini</span>
              </button>
              <button className={`ntm__type-card${type === 'claude' ? ' ntm__type-card--active' : ''}`}
                onClick={() => setType('claude')}>
                <i className="mdi mdi-robot ntm__type-icon" />
                <span className="ntm__type-name">Claude AI Analysis</span>
                <span className="ntm__type-desc">Анализ фото с Anthropic Claude</span>
              </button>
              <button className={`ntm__type-card${type === 'video_convert' ? ' ntm__type-card--active' : ''}`}
                onClick={() => setType('video_convert')}>
                <i className="mdi mdi-video-check ntm__type-icon" />
                <span className="ntm__type-name">Video Convert</span>
                <span className="ntm__type-desc">Конвертация видео через ffmpeg (H.265)</span>
              </button>
              <button className={`ntm__type-card${type === 'file_organizer' ? ' ntm__type-card--active' : ''}`}
                onClick={() => setType('file_organizer')}>
                <i className="mdi mdi-folder-move-outline ntm__type-icon" />
                <span className="ntm__type-name">File Organizer</span>
                <span className="ntm__type-desc">Раскладывание файлов по ГГГГ/ММ/ДД</span>
              </button>
            </div>
          </div>

          {/* ── Active settings summary (read-only, DB tasks only) ── */}
          {!isNewType && (
            <div className="ntm__section ntm__settings-summary">
              <div className="ntm__label">Настройки (из Tools)</div>
              {type === 'video_thumbnails' && (
                <div className="ntm__summary-row">
                  <i className="mdi mdi-cog-outline" />
                  <span>Режим превью: <strong>{VIDEO_MODE_LABELS[settings.videoMode] || settings.videoMode}</strong></span>
                </div>
              )}
              {type === 'openvino' && (
                <div className="ntm__summary-row">
                  <i className="mdi mdi-cog-outline" />
                  <span>Модель: <strong>{settings.ovModel}</strong> · Порог: <strong>{settings.ovConf}%</strong></span>
                </div>
              )}
              {type === 'gemini' && (
                <div className="ntm__summary-row">
                  <i className="mdi mdi-cog-outline" />
                  <span>Модель: <strong>{settings.geminiModel}</strong></span>
                </div>
              )}
              {type === 'claude' && (
                <div className="ntm__summary-row">
                  <i className="mdi mdi-cog-outline" />
                  <span>Модель: <strong>{settings.claudeModel}</strong></span>
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
              {type === 'gemini' ? 'Gemini' : 'Claude'} API key не задан. Откройте Tools → {type === 'gemini' ? 'Google AI' : 'Claude AI'}.
            </div>
          )}

          {/* ── AI scheduling options ─────────────────────────── */}
          {isAiType(type) && (
            <>
              <div className="ntm__section">
                <div className="ntm__label">Пауза между запросами к AI</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'calc(var(--font-base) * 0.85)', color: 'var(--text-dim)' }}>мин:</span>
                  <input type="number" min="0" max="60" step="1" value={delayMin}
                    onChange={e => { const v = +e.target.value; setDelayMin(v); if (delayMax < v) setDelayMax(v) }}
                    className="modal-text-input" style={{ width: 70 }} />
                  <span style={{ fontSize: 'calc(var(--font-base) * 0.85)', color: 'var(--text-dim)' }}>макс:</span>
                  <input type="number" min="0" max="60" step="1" value={delayMax}
                    onChange={e => { const v = +e.target.value; setDelayMax(v); if (delayMin > v) setDelayMin(v) }}
                    className="modal-text-input" style={{ width: 70 }} />
                  <span style={{ fontSize: 'calc(var(--font-base) * 0.82)', color: 'var(--text-dim)' }}>сек (0 = без паузы)</span>
                </div>
              </div>

              <div className="ntm__section">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={useTimeWindow}
                    onChange={e => setUseTimeWindow(e.target.checked)}
                    style={{ accentColor: 'var(--accent)', width: 14, height: 14 }} />
                  <span className="ntm__label" style={{ margin: 0 }}>Ограничить время выполнения</span>
                </label>
                {useTimeWindow && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'calc(var(--font-base) * 0.85)', color: 'var(--text-dim)' }}>с</span>
                    <input type="number" min="0" max="23" step="1" value={activeFromHour}
                      onChange={e => setActiveFromHour(+e.target.value)}
                      className="modal-text-input" style={{ width: 60 }} />
                    <span style={{ fontSize: 'calc(var(--font-base) * 0.85)', color: 'var(--text-dim)' }}>до</span>
                    <input type="number" min="0" max="23" step="1" value={activeToHour}
                      onChange={e => setActiveToHour(+e.target.value)}
                      className="modal-text-input" style={{ width: 60 }} />
                    <span style={{ fontSize: 'calc(var(--font-base) * 0.82)', color: 'var(--text-dim)' }}>часов</span>
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
                <span className="ntm__label" style={{ margin: 0 }}>Перезаписать имеющийся анализ</span>
              </label>
              <div style={{ fontSize: 'calc(var(--font-base) * 0.82)', color: 'var(--text-dim)', marginTop: 4, paddingLeft: 22 }}>
                {reprocessExisting
                  ? 'Все файлы будут обработаны заново, даже если анализ уже есть.'
                  : 'Файлы с готовым анализом будут пропущены (по умолчанию).'}
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

          {/* ══════════════════════════════════════════════════════
              Video Convert params
          ══════════════════════════════════════════════════════ */}
          {type === 'video_convert' && (
            <>
              <div className="ntm__section ntm__params-grid">
                <div className="ntm__param">
                  <label className="ntm__label">Входной паттерн</label>
                  <input type="text" className="modal-text-input" value={vcInputPattern}
                    onChange={e => setVcInputPattern(e.target.value)}
                    placeholder="*.mp4" />
                  <div className="ntm__param-hint">Glob: *.mp4, *.mkv, *.avi</div>
                </div>
                <div className="ntm__param">
                  <label className="ntm__label">Суффикс выходного файла</label>
                  <input type="text" className="modal-text-input" value={vcOutputSuffix}
                    onChange={e => setVcOutputSuffix(e.target.value)}
                    placeholder="_web" />
                  <div className="ntm__param-hint">Добавляется к имени файла</div>
                </div>
                <div className="ntm__param">
                  <label className="ntm__label">Расширение выходного файла</label>
                  <input type="text" className="modal-text-input" value={vcOutputExtension}
                    onChange={e => setVcOutputExtension(e.target.value)}
                    placeholder="mp4" />
                </div>
                <div className="ntm__param">
                  <label className="ntm__label">Кодек</label>
                  <select className="modal-select" value={vcCodec} onChange={e => setVcCodec(e.target.value)}>
                    {VC_CODECS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="ntm__param">
                  <label className="ntm__label">CRF (качество, 18–51)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="range" min="18" max="51" step="1" value={vcCrf}
                      onChange={e => setVcCrf(+e.target.value)}
                      style={{ flex: 1, accentColor: 'var(--accent)' }} />
                    <span style={{ minWidth: 24, fontWeight: 600 }}>{vcCrf}</span>
                  </div>
                  <div className="ntm__param-hint">Меньше = лучше качество, больше файл</div>
                </div>
                <div className="ntm__param">
                  <label className="ntm__label">Preset (скорость кодирования)</label>
                  <select className="modal-select" value={vcPreset} onChange={e => setVcPreset(e.target.value)}>
                    {VC_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div className="ntm__section">
                <div className="ntm__date-header">
                  <label className="ntm__label" style={{margin:0}}>Фильтр по дате файла (mtime)</label>
                  {vcFoDatesFromCamera && (
                    <span className="ntm__date-hint">
                      <i className="mdi mdi-check-circle" style={{fontSize:12,marginRight:3}} />
                      авто-заполнено
                    </span>
                  )}
                </div>
                <div className="ntm__dates">
                  <input type="datetime-local" className="modal-text-input ntm__date-input"
                    value={vcDateFrom}
                    onChange={e => { setVcDateFrom(e.target.value); setVcFoDatesFromCamera(false) }} />
                  <span className="ntm__date-sep">→</span>
                  <input type="datetime-local" className="modal-text-input ntm__date-input"
                    value={vcDateTo}
                    onChange={e => { setVcDateTo(e.target.value); setVcFoDatesFromCamera(false) }} />
                </div>
                <div className="ntm__param-hint" style={{ marginTop: 4 }}>
                  Пусто = обрабатывать все файлы без фильтра по дате
                </div>
              </div>

              <div className="ntm__section ntm__example-row">
                <i className="mdi mdi-information-outline" style={{ color: 'var(--accent)' }} />
                <span>
                  Пример: <code>{vcInputPattern || '*.mp4'}</code> →{' '}
                  <code>{'<basename>'}{vcOutputSuffix || '_web'}.{vcOutputExtension || 'mp4'}</code>
                  &nbsp;· Конвертируется в ту же папку
                </span>
              </div>

              <div className="ntm__section">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={vcDryRun}
                    onChange={e => setVcDryRun(e.target.checked)}
                    style={{ accentColor: '#f59e0b', width: 14, height: 14 }} />
                  <span className="ntm__label" style={{ margin: 0, color: vcDryRun ? '#f59e0b' : undefined }}>
                    Режим симуляции (dry run)
                  </span>
                </label>
                <div style={{ fontSize: 'calc(var(--font-base) * 0.82)', color: 'var(--text-dim)', marginTop: 4, paddingLeft: 22 }}>
                  {vcDryRun ? 'Только лог — файлы не изменяются.' : 'Реальная конвертация файлов.'}
                </div>
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════
              File Organizer params
          ══════════════════════════════════════════════════════ */}
          {type === 'file_organizer' && (
            <>
              <div className="ntm__section ntm__row">
                <label className="ntm__label">Источник</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['snapshots', 'videos'].map(s => (
                    <button key={s}
                      className={`ntm__toggle-btn${foSourceType === s ? ' ntm__toggle-btn--active' : ''}`}
                      onClick={() => setFoSourceType(s)}>
                      <i className={`mdi ${s === 'snapshots' ? 'mdi-camera' : 'mdi-video-outline'}`} />
                      {s === 'snapshots' ? 'Фото (snapshots)' : 'Видео (videos)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ntm__section ntm__params-grid">
                <div className="ntm__param">
                  <label className="ntm__label">Паттерн файлов</label>
                  <input type="text" className="modal-text-input" value={foInputPattern}
                    onChange={e => setFoInputPattern(e.target.value)}
                    placeholder="*.jpg" />
                  <div className="ntm__param-hint">Glob: *.jpg, *.mp4, *.*</div>
                </div>
                <div className="ntm__param">
                  <label className="ntm__label">Папка назначения</label>
                  <input type="text" className="modal-text-input" value={foOutputFolder}
                    onChange={e => setFoOutputFolder(e.target.value)}
                    placeholder="organized" />
                  <div className="ntm__param-hint">Создаётся внутри директории камеры</div>
                </div>
                <div className="ntm__param ntm__param--wide">
                  <label className="ntm__label">Regex для даты в имени файла</label>
                  <input type="text" className="modal-text-input" value={foDateRegex}
                    onChange={e => setFoDateRegex(e.target.value)}
                    placeholder="(\d{4})(\d{2})(\d{2})" style={{ fontFamily: 'monospace' }} />
                  <div className="ntm__param-hint">Группы 1–3: год, месяц, день</div>
                </div>
              </div>

              <div className="ntm__section ntm__example-row">
                <i className="mdi mdi-information-outline" style={{ color: 'var(--accent)' }} />
                <span>
                  Файлы из корня папки → <code>{foOutputFolder || 'organized'}/ГГГГ/ММ/ДД/</code>
                  &nbsp;· Уже перемещённые пропускаются
                </span>
              </div>

              <div className="ntm__section">
                <div className="ntm__date-header">
                  <label className="ntm__label" style={{margin:0}}>Фильтр по дате файла (mtime)</label>
                  {vcFoDatesFromCamera && (
                    <span className="ntm__date-hint">
                      <i className="mdi mdi-check-circle" style={{fontSize:12,marginRight:3}} />
                      авто-заполнено
                    </span>
                  )}
                </div>
                <div className="ntm__dates">
                  <input type="datetime-local" className="modal-text-input ntm__date-input"
                    value={foDateFrom}
                    onChange={e => { setFoDateFrom(e.target.value); setVcFoDatesFromCamera(false) }} />
                  <span className="ntm__date-sep">→</span>
                  <input type="datetime-local" className="modal-text-input ntm__date-input"
                    value={foDateTo}
                    onChange={e => { setFoDateTo(e.target.value); setVcFoDatesFromCamera(false) }} />
                </div>
                <div className="ntm__param-hint" style={{ marginTop: 4 }}>
                  Пусто = обрабатывать все файлы без фильтра по дате
                </div>
              </div>

              <div className="ntm__section">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={foDryRun}
                    onChange={e => setFoDryRun(e.target.checked)}
                    style={{ accentColor: '#f59e0b', width: 14, height: 14 }} />
                  <span className="ntm__label" style={{ margin: 0, color: foDryRun ? '#f59e0b' : undefined }}>
                    Режим симуляции (dry run)
                  </span>
                </label>
                <div style={{ fontSize: 'calc(var(--font-base) * 0.82)', color: 'var(--text-dim)', marginTop: 4, paddingLeft: 22 }}>
                  {foDryRun ? 'Только лог — файлы не перемещаются.' : 'Реальное перемещение файлов.'}
                </div>
              </div>
            </>
          )}

        </div>

        {/* ── Footer ───────────────────────────────────────────── */}
        <div className="ntm__footer">
          <button className="modal-btn neutral" onClick={onClose}>Cancel</button>
          <button className="modal-btn accent" onClick={handleAdd}
            disabled={loading || !cameraId || (isDbType(type) && fileCount === 0) || (isAiType(type) && noApiKey)}>
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
