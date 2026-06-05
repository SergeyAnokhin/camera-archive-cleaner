import { getThumbnailUrl, getVideoThumbnailUrl } from '../api.js'
import './TaskCard.css'

const TYPE_CONFIG = {
  video_thumbnails: { icon: 'mdi-video-outline', label: 'Video Thumbnails' },
  openvino:         { icon: 'mdi-magnify-scan',  label: 'OpenVINO Detection' },
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

function fmtSpeed(v) {
  if (!v) return null
  return v >= 1 ? `${v.toFixed(1)}/s` : `${(v * 60).toFixed(1)}/min`
}

function shortPath(p) {
  if (!p) return ''
  const parts = p.replace(/\\/g, '/').split('/')
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : p
}

export default function TaskCard({
  task,
  onPause, onResume, onCancel, onDelete,
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

  const thumbUrl = task.current_file_id
    ? (task.type === 'openvino'
        ? getThumbnailUrl(task.current_file_id)
        : getVideoThumbnailUrl(task.current_file_id, params.thumb_mode || 'four_frames'))
    : null
  const showThumb = thumbUrl && (isActive || task.status === 'paused')

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
          {statusConf.label}
        </span>

        <div className="tc__btns">
          {task.status === 'running' && (
            <button className="tc__btn tc__btn--warn" title="Pause" onClick={onPause}>
              <i className="mdi mdi-pause" />
            </button>
          )}
          {(task.status === 'paused' || task.status === 'failed') && (
            <button className="tc__btn tc__btn--accent" title="Resume" onClick={onResume}>
              <i className="mdi mdi-play" />
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

      {/* ── Subtitle ───────────────────────────────────────────── */}
      <div className="tc__sub">
        <span className="tc__label">{label || '—'}</span>
        <div className="tc__tags">
          {params.model_name  && <span className="tc__tag">{params.model_name}</span>}
          {params.thumb_mode  && <span className="tc__tag">{params.thumb_mode}</span>}
          {params.confidence != null && <span className="tc__tag">{params.confidence}</span>}
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
