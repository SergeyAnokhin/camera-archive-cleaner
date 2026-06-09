import { getThumbnailUrl, getVideoThumbnailUrl } from '../api.js'
import './TaskCard.css'

const TYPE_CONFIG = {
  video_thumbnails: { icon: 'mdi-video-outline',  label: 'Video Thumbnails' },
  openvino:         { icon: 'mdi-magnify-scan',    label: 'OpenVINO Detection' },
  gemini:           { icon: 'mdi-google',           label: 'Gemini AI Analysis' },
  claude:           { icon: 'mdi-robot',            label: 'Claude AI Analysis' },
}

const STATUS_CONFIG = {
  queued:    { label: 'Queued',   cls: 'queued'    },
  running:   { label: 'Running',  cls: 'running'   },
  pausing:   { label: 'Pausing…', cls: 'pausing'   },
  paused:    { label: 'Paused',   cls: 'paused'    },
  completed: { label: 'Done',     cls: 'completed' },
  failed:    { label: 'Failed',   cls: 'failed'    },
  cancelled: { label: 'Cancelled',cls: 'cancelled' },
}

function fmtEta(s) {
  if (!s || s < 0) return null
  if (s < 60)   return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

function fmtDuration(sec) {
  if (sec == null || sec < 0) return null
  sec = Math.round(sec)
  if (sec < 60)   return `${sec} с`
  if (sec < 3600) {
    const m = Math.floor(sec / 60), s = sec % 60
    return s > 0 ? `${m} мин ${s} с` : `${m} мин`
  }
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60)
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`
}

function fmtCompletedAt(ts) {
  if (!ts) return null
  // SQLite datetime('now') returns "YYYY-MM-DD HH:MM:SS" (UTC)
  const d = new Date(ts.replace(' ', 'T') + 'Z')
  if (isNaN(d)) return null
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yestStart  = new Date(todayStart - 86400000)
  const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  if (d >= todayStart)  return `сегодня ${hm}`
  if (d >= yestStart)   return `вчера ${hm}`
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)} ${hm}`
}

function fmtSpeed(v) {
  if (!v) return null
  return v >= 1 ? `${v.toFixed(1)}/s` : `${(v * 60).toFixed(1)}/min`
}

function shortPath(p) {
  if (!p) return ''
  const parts = p.replace(/\\/g, '/').split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : p
}

function inTimeWindow(currentHour, fromHour, toHour) {
  if (fromHour === toHour) return true
  if (fromHour < toHour) return fromHour <= currentHour && currentHour < toHour
  return currentHour >= fromHour || currentHour < toHour
}

function pad2(n) { return String(n).padStart(2, '0') }

export default function TaskCard({
  task,
  onPause, onResume, onSkip, onCancel, onDelete, onViewResults,
  onDragStart, onDragOver, onDrop, onDragEnd,
  isDragOver,
}) {
  const typeConf   = TYPE_CONFIG[task.type]   || { icon: 'mdi-cog-outline', label: task.type }
  const statusConf = STATUS_CONFIG[task.status] || { label: task.status, cls: 'queued' }
  const params     = task.params || {}

  const isActive = task.status === 'running' || task.status === 'pausing'
  const hasBar   = ['running','pausing','paused','completed','failed'].includes(task.status)
  const pct      = task.progress_total > 0
    ? Math.min(100, Math.round(task.progress_current / task.progress_total * 100))
    : 0

  const label = params.label ||
    [params.camera_id, params.date_from?.slice(0, 10), '–', params.date_to?.slice(0, 10)]
      .filter(Boolean).join(' ')

  const isQueued = task.status === 'queued'

  // Time-window sleeping check (for queued AI tasks)
  const fromH = params.active_from_hour
  const toH   = params.active_to_hour
  const isSleeping = isQueued && fromH != null && toH != null
    && !inTimeWindow(new Date().getHours(), Number(fromH), Number(toH))
  const sleepWindowLabel = fromH != null && toH != null
    ? `${pad2(fromH)}:00–${pad2(toH)}:00`
    : ''

  const thumbUrl = task.current_file_id
    ? (task.type === 'openvino'
        ? getThumbnailUrl(task.current_file_id)
        : getVideoThumbnailUrl(task.current_file_id, params.thumb_mode || 'four_frames'))
    : null
  const showThumb = thumbUrl && (isActive || task.status === 'paused')

  const isAiTask = task.type === 'gemini' || task.type === 'claude' || task.type === 'openvino'
  const canViewResults = isAiTask && onViewResults

  const isFinished = ['completed', 'failed', 'cancelled'].includes(task.status)
  const durationSec = task.started_at && task.completed_at
    ? (new Date(task.completed_at.replace(' ', 'T') + 'Z') - new Date(task.started_at.replace(' ', 'T') + 'Z')) / 1000
    : null
  const durationStr   = fmtDuration(durationSec)
  const completedStr  = fmtCompletedAt(task.completed_at)

  return (
    <div
      className={`tc tc--${statusConf.cls}${isDragOver ? ' tc--dragover' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={e => { e.preventDefault(); onDragOver?.() }}
      onDrop={e => { e.preventDefault(); onDrop?.() }}
      onDragEnd={onDragEnd}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="tc__head">
        <i className="mdi mdi-drag-vertical tc__drag-handle" title="Drag to reorder" />
        <i className={`mdi ${typeConf.icon} tc__type-icon`} />
        <span className="tc__type-name">{typeConf.label}</span>
        <span className={`tc__badge tc__badge--${statusConf.cls}`}>
          {isActive && <i className="mdi mdi-loading mdi-spin tc__badge-spin" />}
          {isSleeping && <i className="mdi mdi-moon-waning-crescent tc__badge-spin" style={{ animationName: 'none', marginRight: 4 }} />}
          {statusConf.label}
        </span>

        <div className="tc__btns">
          {canViewResults && (
            <button className="tc__btn tc__btn--accent" title="View results in heatmap" onClick={() => onViewResults(task)}>
              <i className="mdi mdi-map-search-outline" />
            </button>
          )}
          {task.status === 'running' && (
            <button className="tc__btn tc__btn--warn" title="Pause" onClick={onPause}>
              <i className="mdi mdi-pause" />
            </button>
          )}
          {(task.status === 'paused' || task.status === 'failed') && (
            <button className="tc__btn tc__btn--accent" title="Retry (resume from current file)" onClick={onResume}>
              <i className="mdi mdi-play" />
            </button>
          )}
          {task.status === 'failed' && onSkip && (
            <button className="tc__btn tc__btn--warn" title="Skip current file and continue" onClick={onSkip}>
              <i className="mdi mdi-skip-next" />
            </button>
          )}
          {!['completed', 'cancelled'].includes(task.status) && (
            <button className="tc__btn tc__btn--dim" title="Cancel" onClick={onCancel}>
              <i className="mdi mdi-close" />
            </button>
          )}
          {['completed', 'cancelled', 'failed'].includes(task.status) && (
            <button className="tc__btn tc__btn--danger" title="Remove" onClick={onDelete}>
              <i className="mdi mdi-delete-outline" />
            </button>
          )}
        </div>
      </div>

      {/* ── Sleeping indicator ─────────────────────────────────── */}
      {isSleeping && (
        <div style={{
          fontSize: 'calc(var(--font-base) * 0.8)',
          color: '#818cf8',
          padding: '2px 12px 4px',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}>
          <i className="mdi mdi-clock-outline" />
          Ожидание временного окна {sleepWindowLabel}
        </div>
      )}

      {/* ── Subtitle ───────────────────────────────────────────── */}
      <div className="tc__sub">
        <span className="tc__label">{label || '—'}</span>
        <div className="tc__tags">
          {params.model_name  && <span className="tc__tag">{params.model_name}</span>}
          {params.model       && <span className="tc__tag">{params.model}</span>}
          {params.thumb_mode  && <span className="tc__tag">{params.thumb_mode}</span>}
          {params.confidence != null && <span className="tc__tag">{params.confidence}</span>}
          {params.delay_max_sec > 0 && (
            <span className="tc__tag"><i className="mdi mdi-timer-pause-outline" /> {params.delay_min_sec}–{params.delay_max_sec}s</span>
          )}
          {fromH != null && toH != null && (
            <span className="tc__tag"><i className="mdi mdi-clock-time-four-outline" /> {pad2(Number(fromH))}:00–{pad2(Number(toH))}:00</span>
          )}
        </div>
      </div>

      {/* ── Progress ───────────────────────────────────────────── */}
      {hasBar ? (
        <div className="tc__prog">
          <div className="tc__bar-track">
            <div
              className={`tc__bar-fill tc__bar-fill--${statusConf.cls}${isActive ? ' tc__bar-fill--anim' : ''}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="tc__prog-row">
            <span className="tc__counter">{task.progress_current}/{task.progress_total}</span>
            <span className="tc__pct">{pct}%</span>
            {isActive && task.speed_per_sec != null && (
              <span className="tc__speed">
                <i className="mdi mdi-lightning-bolt" />
                {fmtSpeed(task.speed_per_sec)}
              </span>
            )}
            {isActive && task.eta_seconds != null && (
              <span className="tc__eta">
                <i className="mdi mdi-clock-outline" />
                ~{fmtEta(task.eta_seconds)}
              </span>
            )}
            {task.status === 'completed' && (
              <span className="tc__done"><i className="mdi mdi-check-circle-outline" /></span>
            )}
          </div>
        </div>
      ) : (
        <div className="tc__prog tc__prog--skel">
          <div className="tc__bar-track" />
          <div className="tc__prog-row">
            <div className="tc__skel-line tc__skel-line--short" />
          </div>
        </div>
      )}

      {/* ── Completion meta (duration + finished-at) ─────────────────── */}
      {isFinished && (durationStr || completedStr) && (
        <div className="tc__meta">
          {durationStr && (
            <span><i className="mdi mdi-timer-outline" /> {durationStr}</span>
          )}
          {completedStr && (
            <span><i className="mdi mdi-clock-check-outline" /> {completedStr}</span>
          )}
        </div>
      )}

      {/* ── Current file (always rendered for consistent card height) ── */}
      <div className={`tc__file${task.status === 'paused' ? ' tc__file--dim' : ''}${isQueued ? ' tc__file--skel' : ''}`}>
        {showThumb ? (
          <img src={thumbUrl} alt="" className="tc__thumb" loading="lazy"
            onError={e => { e.currentTarget.style.display = 'none' }} />
        ) : isQueued ? (
          <div className="tc__thumb tc__thumb--skel" />
        ) : (
          <div className="tc__thumb tc__thumb--icon">
            <i className={`mdi ${typeConf.icon}`} />
          </div>
        )}
        {isQueued ? (
          <div className="tc__skel-line" />
        ) : (
          <span className="tc__file-path">
            {task.current_file_path ? shortPath(task.current_file_path) : '…'}
          </span>
        )}
      </div>

      {/* ── Error ──────────────────────────────────────────────── */}
      {task.status === 'failed' && task.error_message && (
        <div className="tc__error">{task.error_message}</div>
      )}
    </div>
  )
}
