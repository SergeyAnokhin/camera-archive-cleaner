import { useState, useEffect, useRef, useMemo } from 'react'
import { getFiles, getDistribution, getStatsTotal, getMediaUrl, previewDelete, confirmDelete, previewDeleteRange, getAiAnalysis } from '../api.js'
import DeleteConfirmModal from './DeleteConfirmModal.jsx'
import GeminiAnalysisModal from './GeminiAnalysisModal.jsx'
import ClaudeAnalysisModal from './ClaudeAnalysisModal.jsx'
import { VIEW_MODES, DEFAULT_VIEW_MODE_KEY } from './viewModes/index.js'
import { resolveAiIcons } from '../aiHelpers.js'
import './HourViewer.css'

const PAGE_SIZE_KEY    = 'hour_page_size'
const PAGE_SIZE_DEFAULT = 50
const ZOOM_KEY         = 'hover_zoom'
const ZOOM_DEFAULT     = 1.5
const THUMB_WIDTH_KEY  = 'thumb_width'
const THUMB_WIDTH_DEFAULT = 140
const DIFF_THRESHOLD_KEY  = 'diff_threshold'
const DIFF_THRESHOLD_DEFAULT = 20
const VIEW_MODE_KEY    = 'hour_view_mode'
const MODE_PARAMS_PREFIX = 'mode_params_'

function getPageSize()   { return Number(localStorage.getItem(PAGE_SIZE_KEY)) || PAGE_SIZE_DEFAULT }
function getHoverZoom()  { return Number(localStorage.getItem(ZOOM_KEY)) || ZOOM_DEFAULT }
function getThumbWidth() { return Number(localStorage.getItem(THUMB_WIDTH_KEY)) || THUMB_WIDTH_DEFAULT }

function loadModeParams(modeKey, defaults) {
  try {
    const raw = localStorage.getItem(MODE_PARAMS_PREFIX + modeKey)
    if (raw) return { ...defaults, ...JSON.parse(raw) }
  } catch {}
  return defaults
}

function saveModeParams(modeKey, params) {
  localStorage.setItem(MODE_PARAMS_PREFIX + modeKey, JSON.stringify(params))
}

function buildInitialModeParams() {
  const globalDefault = Number(localStorage.getItem(DIFF_THRESHOLD_KEY)) || DIFF_THRESHOLD_DEFAULT
  const result = {}
  for (const m of VIEW_MODES) {
    if (!m.params?.length) continue
    const defaults = Object.fromEntries(m.params.map(p => [p.key, p.key === 'threshold' ? globalDefault : p.default]))
    result[m.key] = loadModeParams(m.key, defaults)
  }
  return result
}

function formatTime(ts) { return ts ? ts.substring(11, 19) : '' }

function formatBytes(b) {
  if (!b) return '0 B'
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`
  return `${(b / 1e3).toFixed(0)} KB`
}

// ---------------------------------------------------------------------------
// Video modal
// ---------------------------------------------------------------------------

function VideoModal({ file, onClose }) {
  const [videoError, setVideoError] = useState(false)
  const mediaUrl = getMediaUrl(file.id)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' || e.key === 'Backspace') { e.stopImmediatePropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  function openExternal() { window.open(mediaUrl, '_blank') }

  return (
    <div className="hv-lightbox hv-video-modal" onClick={onClose}>
      <div className="hv-video-modal-inner" onClick={e => e.stopPropagation()}>
        <div className="hv-video-modal-header">
          <span className="hv-video-modal-title">
            <i className="mdi mdi-video" /> {formatTime(file.timestamp)}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="hv-video-modal-btn" onClick={openExternal}>
              <i className="mdi mdi-open-in-new" /> Open externally
            </button>
            <a className="hv-video-modal-btn" href={mediaUrl} download onClick={e => e.stopPropagation()}>
              <i className="mdi mdi-download" /> Download
            </a>
            <button className="hv-video-modal-btn" onClick={onClose}>
              <i className="mdi mdi-close" />
            </button>
          </div>
        </div>
        {videoError ? (
          <div className="hv-video-error">
            <i className="mdi mdi-alert-circle-outline hv-video-error-icon" />
            <p>This video format can't be played in the browser.</p>
            <p className="hv-video-error-hint">Open with VLC:</p>
            <div className="hv-video-cmd">
              <code className="hv-video-cmd-text">vlc &quot;{file.file_path}&quot;</code>
              <button
                className="hv-video-cmd-copy"
                title="Copy to clipboard"
                onClick={() => navigator.clipboard.writeText(`vlc "${file.file_path}"`)}
              >
                <i className="mdi mdi-content-copy" />
              </button>
            </div>
          </div>
        ) : (
          <video
            className="hv-video-fullplayer"
            src={mediaUrl}
            controls
            autoPlay
            onError={e => {
              console.warn('[VideoModal] error', e.target.error?.code, e.target.error?.message)
              setVideoError(true)
            }}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function ModeSettingsPanel({ mode, params, onChange }) {
  if (!mode.params?.length) return null
  return (
    <div className="hv-mode-settings">
      <span className="hv-mode-settings-label">{mode.label}</span>
      {mode.params.map(p => (
        <div key={p.key} className="hv-mode-param">
          <span className="hv-mode-param-name">{p.label}</span>
          <input
            type="range"
            min={p.min} max={p.max} step={p.step}
            value={params[p.key] ?? p.default}
            onChange={e => onChange(p.key, Number(e.target.value))}
            className="hv-mode-param-slider"
          />
          <span className="hv-mode-param-value">{params[p.key] ?? p.default}</span>
        </div>
      ))}
    </div>
  )
}

function PhotoCard({ file, hoverZoom, mode, pagePhotoIds, params, selectionMode, selected, onToggle, index, isFocused, aiData }) {
  const [loaded, setLoaded]         = useState(false)
  const [error, setError]           = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)
  const cardRef = useRef(null)

  useEffect(() => {
    if (isFocused) cardRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [isFocused])

  useEffect(() => {
    if (!fullscreen) return
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Backspace') { e.stopImmediatePropagation(); setFullscreen(false) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [fullscreen])

  const src = mode.getImageUrl(file, { pagePhotoIds, params })

  useEffect(() => {
    setLoaded(false)
    setError(false)
  }, [src])

  function handleClick(e) {
    if (selectionMode) { onToggle(file, index, e.shiftKey) } else { setFullscreen(true) }
  }

  return (
    <>
      <div
        ref={cardRef}
        className={`hv-card hv-card-photo${selectionMode && selected ? ' hv-selected' : ''}${isFocused ? ' hv-card-focused' : ''}`}
        style={{ '--hv-zoom': selectionMode ? 1 : hoverZoom }}
        title={selectionMode ? formatTime(file.timestamp) : `${formatTime(file.timestamp)} — click to enlarge`}
        onClick={handleClick}
      >
        {selectionMode && (
          <div className={`hv-card-checkbox${selected ? ' checked' : ''}`}>
            <i className={`mdi mdi-${selected ? 'checkbox-marked' : 'checkbox-blank-outline'}`} />
          </div>
        )}
        {!loaded && !error && <div className="hv-img-skeleton skeleton" />}
        {error
          ? <div className="hv-img-error"><i className="mdi mdi-image-broken-variant" /></div>
          : <img
              src={src}
              alt={formatTime(file.timestamp)}
              className="hv-photo-img"
              style={{ display: loaded ? 'block' : 'none' }}
              onLoad={() => setLoaded(true)}
              onError={() => setError(true)}
            />
        }
        <span className="hv-card-time">{formatTime(file.timestamp)}</span>

        {/* AI analysis icons — top-left corner */}
        {aiData?.objects && (() => {
          const icons = resolveAiIcons(aiData.objects)
          if (!icons.length) return null
          return (
            <div className="hv-card-ai-icons">
              {icons.slice(0, 4).map((ic, i) => (
                <i key={i} className={`mdi ${ic.mdi}`} style={{ color: ic.color }} title={ic.label} />
              ))}
              {icons.length > 4 && <span className="hv-card-ai-more">+{icons.length - 4}</span>}
            </div>
          )
        })()}

        {/* AI description tooltip on hover — only in AI mode */}
        {aiData?.image_description && !selectionMode && mode.isAiMode && (
          <div
            className={`hv-card-ai-desc${descExpanded ? ' expanded' : ''}`}
            onClick={e => { e.stopPropagation(); setDescExpanded(v => !v) }}
            title={descExpanded ? 'Нажмите чтобы свернуть' : 'Нажмите чтобы развернуть'}
          >
            <div className="hv-card-ai-desc-text">{aiData.image_description}</div>
            {aiData.objects && (
              <div className="hv-card-ai-desc-objects">
                {aiData.objects.split(/\s+/).filter(Boolean).map((o, i) => (
                  <span key={i} className="hv-card-ai-tag">{o}</span>
                ))}
              </div>
            )}
            <div className="hv-card-ai-desc-model">{aiData.model}</div>
          </div>
        )}
      </div>
      {!selectionMode && fullscreen && (
        <div className="hv-lightbox" onClick={() => setFullscreen(false)}>
          <img src={getMediaUrl(file.id)} alt={formatTime(file.timestamp)} className="hv-lightbox-img" />
        </div>
      )}
    </>
  )
}

function VideoCard({ file, selectionMode, selected, onToggle, index, isFocused }) {
  const [modalOpen, setModalOpen] = useState(false)
  const cardRef = useRef(null)

  useEffect(() => {
    if (isFocused) cardRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [isFocused])

  function handleClick(e) {
    if (selectionMode) { onToggle(file, index, e.shiftKey) } else { setModalOpen(true) }
  }

  return (
    <>
      <div
        ref={cardRef}
        className={`hv-card hv-card-video${selectionMode && selected ? ' hv-selected' : ''}${isFocused ? ' hv-card-focused' : ''}`}
        onClick={handleClick}
        title={`${formatTime(file.timestamp)}${selectionMode ? '' : ' — click to play'}`}
      >
        {selectionMode && (
          <div className={`hv-card-checkbox${selected ? ' checked' : ''}`}>
            <i className={`mdi mdi-${selected ? 'checkbox-marked' : 'checkbox-blank-outline'}`} />
          </div>
        )}
        <i className="mdi mdi-video hv-video-icon" />
        <span className="hv-card-time">{formatTime(file.timestamp)}</span>
      </div>
      {!selectionMode && modalOpen && <VideoModal file={file} onClose={() => setModalOpen(false)} />}
    </>
  )
}

// ---------------------------------------------------------------------------
// Selection bar (horizontal, below distribution chart)
// ---------------------------------------------------------------------------

function SelectionBar({ files, selectedCount, selectionStats, onSelectAll, onSelectNone, onDelete, onCancel, loading }) {
  return (
    <div className="hv-select-bar">
      <button className="hv-sbar-btn" onClick={onSelectAll}>
        <i className="mdi mdi-select-all" /> All ({files.length})
      </button>
      <button className="hv-sbar-btn" onClick={onSelectNone} disabled={selectedCount === 0}>
        <i className="mdi mdi-select-off" /> None
      </button>
      {selectedCount > 0 && (
        <div className="hv-sbar-stats">
          {selectionStats.photos > 0 && <span><i className="mdi mdi-image-outline" /> {selectionStats.photos}</span>}
          {selectionStats.videos > 0 && <span><i className="mdi mdi-video-outline" /> {selectionStats.videos}</span>}
          <span>{formatBytes(selectionStats.bytes)}</span>
        </div>
      )}
      <div className="hv-sbar-spacer" />
      <button
        className="hv-sbar-btn hv-sbar-danger"
        onClick={onDelete}
        disabled={loading || selectedCount === 0}
      >
        {loading
          ? <i className="mdi mdi-loading mdi-spin" />
          : <><i className="mdi mdi-delete-outline" /> Delete {selectedCount}</>
        }
      </button>
      <button className="hv-sbar-btn hv-sbar-cancel" onClick={onCancel}>
        <i className="mdi mdi-close" /> Cancel
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Distribution chart  (60 bars = 1 per minute, stacked photo/video by size)
// ---------------------------------------------------------------------------

function DistributionChart({ buckets, pageSize, page, total, onGoToPage, hourStats }) {
  const chartRef   = useRef(null)
  const [hoveredIdx, setHoveredIdx] = useState(null)
  const maxSize    = useMemo(() => Math.max(...buckets.map(b => b.total_size_bytes ?? 0), 1), [buckets])
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const cumulative = useMemo(() => {
    const result = [0]
    for (const b of buckets) result.push(result[result.length - 1] + b.total_count)
    return result
  }, [buckets])

  const pageStart = (page - 1) * pageSize
  const pageEnd   = page * pageSize - 1
  let firstActive = -1, lastActive = -1
  buckets.forEach((b, i) => {
    if (b.total_count === 0) return
    const bStart = cumulative[i], bEnd = cumulative[i] + b.total_count - 1
    if (bEnd >= pageStart && bStart <= pageEnd) {
      if (firstActive < 0) firstActive = i
      lastActive = i
    }
  })

  const highlightStyle = firstActive >= 0 ? {
    left:  `${(firstActive / 60) * 100}%`,
    width: `${((lastActive - firstActive + 1) / 60) * 100}%`,
  } : null

  function handleClick(e) {
    if (!chartRef.current) return
    const rect = chartRef.current.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    let idx    = Math.floor(frac * 60)
    if (buckets[idx]?.total_count === 0) {
      let found = false
      for (let d = 1; d < 60 && !found; d++) {
        if (idx + d < 60 && buckets[idx + d]?.total_count > 0) { idx = idx + d; found = true }
        else if (idx - d >= 0 && buckets[idx - d]?.total_count > 0) { idx = idx - d; found = true }
      }
      if (!found) return
    }
    onGoToPage(Math.floor(cumulative[idx] / pageSize) + 1)
  }

  const hovered = hoveredIdx !== null ? buckets[hoveredIdx] : null

  return (
    <div className="hv-dist-root">
      <div className="hv-dist-header">
        <span className="hv-dist-title">
          <i className="mdi mdi-chart-bar" /> Distribution per minute
        </span>
        {hourStats && (
          <span className="hv-dist-hourstat">
            <span><i className="mdi mdi-image-outline" /> {hourStats.photo_count.toLocaleString()}</span>
            <span className="hv-dist-stat-sep">·</span>
            <span><i className="mdi mdi-video-outline" /> {hourStats.video_count.toLocaleString()}</span>
            <span className="hv-dist-stat-sep">·</span>
            <span>{formatBytes(hourStats.total_size_bytes)}</span>
          </span>
        )}
        <span className="hv-dist-hint">click to jump</span>
      </div>
      <div className="hv-dist-chart" ref={chartRef} onClick={handleClick}>
        {highlightStyle && <div className="hv-dist-highlight" style={highlightStyle} />}

        {/* Hover tooltip */}
        {hovered && hovered.total_count > 0 && (
          <div
            className="hv-dist-tooltip"
            style={{ left: `${Math.min(Math.max(((hoveredIdx + 0.5) / 60) * 100, 5), 87)}%` }}
          >
            <div className="hv-dist-tooltip-time">:{String(hoveredIdx).padStart(2, '0')}</div>
            {hovered.photo_count > 0 && (
              <div><i className="mdi mdi-image-outline" /> {hovered.photo_count} · {formatBytes(hovered.photo_size_bytes)}</div>
            )}
            {hovered.video_count > 0 && (
              <div><i className="mdi mdi-video-outline" /> {hovered.video_count} · {formatBytes(hovered.video_size_bytes)}</div>
            )}
          </div>
        )}

        {buckets.map((b, i) => {
          const showLabel = i % 15 === 0
          const hPct = b.total_size_bytes > 0 ? Math.max((b.total_size_bytes / maxSize) * 100, 4) : 0
          const videoPct = b.total_size_bytes > 0 ? ((b.video_size_bytes ?? 0) / b.total_size_bytes) * 100 : 0
          return (
            <div
              key={i}
              className={`hv-dist-col${b.total_count === 0 ? ' empty' : ''}`}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div className="hv-dist-bar-wrap">
                {b.total_size_bytes > 0 && (
                  <div className="hv-dist-bar" style={{ height: `${hPct}%` }}>
                    <div className="hv-dist-bar-video" style={{ height: `${videoPct}%` }} />
                    <div className="hv-dist-bar-photo" />
                  </div>
                )}
              </div>
              <div className="hv-dist-label">{showLabel ? `:${String(i).padStart(2,'0')}` : ''}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AI analysis helpers
// ---------------------------------------------------------------------------

function recordAiRequest(provider) {
  const key = `ai_requests_${provider}`
  const now = Date.now()
  const arr = JSON.parse(localStorage.getItem(key) || '[]')
  arr.push(now)
  const cutoff = now - 25 * 60 * 60 * 1000  // keep 25h to be safe
  localStorage.setItem(key, JSON.stringify(arr.filter(t => t > cutoff)))
}

function getAiRequestStats(provider) {
  const key = `ai_requests_${provider}`
  const now = Date.now()
  const arr = JSON.parse(localStorage.getItem(key) || '[]')
  return {
    lastMinute: arr.filter(t => t > now - 60_000).length,
    last24h:    arr.filter(t => t > now - 86_400_000).length,
  }
}

const AI_PROVIDER_CONFIG = {
  gemini: {
    modelKey: 'gemini_model',
    defaultModel: 'gemini-3.1-flash-lite',
    models: [
      { value: 'gemini-3.1-flash-lite',    label: '🟢 gemini-3.1-flash-lite ($0.25/$1.50)' },
      { value: 'gemini-2.5-flash-lite',    label: '🟢 gemini-2.5-flash-lite ($0.10/$0.40)' },
      { value: 'gemini-2.5-flash',         label: '🟡 gemini-2.5-flash ($0.30/$2.50)' },
      { value: 'gemini-3.1-flash-preview', label: '🟡 gemini-3.1-flash-preview ($0.50/$3.00)' },
      { value: 'gemini-2.5-pro',           label: '🔴 gemini-2.5-pro ($1.25/$10.00)' },
      { value: 'gemini-3.1-pro-preview',   label: '🔴 gemini-3.1-pro-preview ($2.00/$12.00)' },
    ],
    icon: 'mdi-google',
    label: 'Gemini Analysis',
  },
  claude: {
    modelKey: 'claude_model',
    defaultModel: 'claude-haiku-4-5-20251001',
    models: [
      { value: 'claude-haiku-4-5-20251001', label: '🟢 claude-haiku-4-5 ($0.80/$4.00)' },
      { value: 'claude-sonnet-4-6',         label: '🟡 claude-sonnet-4-6 ($3.00/$15.00)' },
      { value: 'claude-opus-4-7',           label: '🔴 claude-opus-4-7 ($15.00/$75.00)' },
    ],
    icon: 'mdi-robot',
    label: 'Claude Analysis',
  },
}

function AiModePanel({ provider, files, selectedIds, aiAnalysisMap, onRun, statsKey }) {
  const cfg = AI_PROVIDER_CONFIG[provider] ?? AI_PROVIDER_CONFIG.gemini
  const [model, setModel] = useState(() =>
    localStorage.getItem(cfg.modelKey) || cfg.defaultModel
  )

  // Re-sync model when provider changes
  useEffect(() => {
    setModel(localStorage.getItem(cfg.modelKey) || cfg.defaultModel)
  }, [provider])

  const stats = getAiRequestStats(provider)

  const photoFiles = files.filter(f => f.file_type === 'photo')
  const targetCount = selectedIds.size > 0
    ? photoFiles.filter(f => selectedIds.has(f.id)).length
    : photoFiles.length
  const analyzedCount = photoFiles.filter(f => aiAnalysisMap.has(f.id)).length
  const sceneEntry = [...aiAnalysisMap.values()][0]

  function handleModelChange(e) {
    setModel(e.target.value)
    localStorage.setItem(cfg.modelKey, e.target.value)
  }

  return (
    <div className="hv-mode-settings hv-ai-panel">
      <span className="hv-mode-settings-label">
        <i className={`mdi ${cfg.icon}`} /> {cfg.label}
      </span>
      <div className="hv-ai-panel-info">
        {analyzedCount > 0
          ? <><i className="mdi mdi-check-circle-outline" style={{color:'#86efac'}} /> {analyzedCount}/{photoFiles.length} проанализировано</>
          : <><i className="mdi mdi-circle-outline" style={{color:'var(--text-dim)'}} /> не проанализировано</>
        }
      </div>
      <select className="hv-ai-model-select" value={model} onChange={handleModelChange}>
        {cfg.models.map(m => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>
      <button className="hv-ai-run-btn" onClick={onRun}>
        <i className="mdi mdi-play" />
        {selectedIds.size > 0
          ? `Анализ выбранных (${targetCount})`
          : `Анализ страницы (${photoFiles.length})`
        }
      </button>
      {(stats.lastMinute > 0 || stats.last24h > 0) && (
        <div className="hv-ai-stats">
          <i className="mdi mdi-chart-timeline-variant" />
          {stats.lastMinute > 0 && <span>{stats.lastMinute}/мин</span>}
          <span>{stats.last24h}/24ч</span>
        </div>
      )}
      {sceneEntry?.scene_description && (
        <div className="hv-ai-scene" title={sceneEntry.scene_description}>
          <i className="mdi mdi-image-filter-hdr-outline" />
          {sceneEntry.scene_description.length > 120
            ? sceneEntry.scene_description.slice(0, 120) + '…'
            : sceneEntry.scene_description}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// HourViewer
// ---------------------------------------------------------------------------

export default function HourViewer({ cameraId, camera, dateFrom, dateTo, label, onBack, onFilesDeleted }) {
  const [files, setFiles]               = useState([])
  const [total, setTotal]               = useState(0)
  const [page, setPage]                 = useState(1)
  const [loading, setLoading]           = useState(false)
  const [pageSize, setPageSize]         = useState(getPageSize)
  const [hoverZoom, setHoverZoom]       = useState(getHoverZoom)
  const [thumbWidth, setThumbWidth]     = useState(getThumbWidth)
  const [viewMode, setViewMode]         = useState(() => localStorage.getItem(VIEW_MODE_KEY) || DEFAULT_VIEW_MODE_KEY)
  const [modeParams, setModeParams]     = useState(buildInitialModeParams)
  const [peekOriginal, setPeekOriginal] = useState(false)
  const [distribution, setDistribution] = useState([])
  const [hourStats, setHourStats]       = useState(null)

  const [selectionMode, setSelectionMode]     = useState(false)
  const [selectedMap, setSelectedMap]         = useState(new Map())
  const [preview, setPreview]                 = useState(null)
  const [previewLoading, setPreviewLoading]   = useState(false)
  const [deleteLoading, setDeleteLoading]     = useState(false)
  const [deleteError, setDeleteError]         = useState(null)
  const [deleteSuccess, setDeleteSuccess]     = useState(null)
  const [internalRefreshKey, setInternalRefreshKey] = useState(0)
  const [hourPreview, setHourPreview]         = useState(null)
  const [hourPreviewLoading, setHourPreviewLoading] = useState(false)
  const [hourDeleteLoading, setHourDeleteLoading] = useState(false)
  const [hourDeleteError, setHourDeleteError] = useState(null)

  const [geminiOpen, setGeminiOpen]         = useState(false)
  const [geminiStructured, setGeminiStructured] = useState(false)
  const [claudeOpen, setClaudeOpen]         = useState(false)
  const [aiAnalysisMap, setAiAnalysisMap]   = useState(new Map())
  const [aiStatsKey, setAiStatsKey]         = useState(0)

  const [focusedFileIndex, setFocusedFileIndex] = useState(null)
  const gridRef = useRef(null)
  const anchorIdxRef = useRef(null)
  const anchorActionRef = useRef(null)  // true = selecting, false = deselecting

  const selectedIds = useMemo(() => new Set(selectedMap.keys()), [selectedMap])

  const selectionStats = useMemo(() => {
    let photos = 0, videos = 0, bytes = 0
    for (const f of selectedMap.values()) {
      f.file_type === 'photo' ? photos++ : videos++
      bytes += f.file_size || 0
    }
    return { photos, videos, bytes }
  }, [selectedMap])

  useEffect(() => {
    function onPageSize()   { setPageSize(getPageSize()); setPage(1) }
    function onZoom()       { setHoverZoom(getHoverZoom()) }
    function onThumbWidth() { setThumbWidth(getThumbWidth()) }
    document.addEventListener('hour-page-size-change', onPageSize)
    document.addEventListener('hover-zoom-change', onZoom)
    document.addEventListener('thumb-width-change', onThumbWidth)
    return () => {
      document.removeEventListener('hour-page-size-change', onPageSize)
      document.removeEventListener('hover-zoom-change', onZoom)
      document.removeEventListener('thumb-width-change', onThumbWidth)
    }
  }, [])

  useEffect(() => {
    function onDown(e) {
      if (e.key !== 'n' && e.key !== 'N') return
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'SELECT') return
      setPeekOriginal(true)
    }
    function onUp(e) {
      if (e.key === 'n' || e.key === 'N') setPeekOriginal(false)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])

  useEffect(() => {
    getDistribution(cameraId, dateFrom, dateTo)
      .then(data => setDistribution(data.buckets ?? []))
      .catch(() => setDistribution([]))
  }, [cameraId, dateFrom, dateTo, internalRefreshKey])

  useEffect(() => {
    getStatsTotal(cameraId, dateFrom, dateTo)
      .then(setHourStats)
      .catch(() => setHourStats(null))
  }, [cameraId, dateFrom, dateTo, internalRefreshKey])

  useEffect(() => {
    setLoading(true)
    getFiles(cameraId, dateFrom, dateTo, page, pageSize)
      .then(data => { setFiles(data.files ?? []); setTotal(data.total ?? 0) })
      .catch(() => { setFiles([]); setTotal(0) })
      .finally(() => setLoading(false))
  }, [cameraId, dateFrom, dateTo, page, pageSize, internalRefreshKey])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const pagePhotoIds = useMemo(
    () => files.filter(f => f.file_type === 'photo').map(f => f.id),
    [files]
  )

  function toggleSelectionMode() {
    setSelectionMode(v => !v)
    setSelectedMap(new Map())
    anchorIdxRef.current = null
    anchorActionRef.current = null
    setDeleteError(null)
    setDeleteSuccess(null)
  }

  function toggleSelect(file, idx, shiftKey) {
    setSelectedMap(prev => {
      const next = new Map(prev)
      if (shiftKey && anchorIdxRef.current !== null) {
        const lo = Math.min(anchorIdxRef.current, idx)
        const hi = Math.max(anchorIdxRef.current, idx)
        const adding = anchorActionRef.current
        for (let i = lo; i <= hi; i++) {
          if (adding) next.set(files[i].id, files[i])
          else next.delete(files[i].id)
        }
      } else {
        const wasSelected = next.has(file.id)
        wasSelected ? next.delete(file.id) : next.set(file.id, file)
        anchorIdxRef.current = idx
        anchorActionRef.current = !wasSelected
      }
      return next
    })
  }

  useEffect(() => {
    if (selectionMode) return
    function onKey(e) {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'SELECT') return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        onBack()
      } else if (e.key === 'Backspace' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault()
        handleDeleteHourPreview()
      } else if (e.key === 'PageUp') {
        e.preventDefault(); setPage(p => Math.max(1, p - 1))
      } else if (e.key === 'PageDown') {
        e.preventDefault(); setPage(p => Math.min(totalPages, p + 1))
      } else if (e.key === 'Home') {
        e.preventDefault(); setPage(1)
      } else if (e.key === 'End') {
        e.preventDefault(); setPage(totalPages)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (files.length === 0) return
        e.preventDefault()
        const cols = getGridCols()
        setFocusedFileIndex(prev => {
          const cur = prev ?? 0
          let next = cur
          if (e.key === 'ArrowRight') next = cur + 1
          else if (e.key === 'ArrowLeft') next = cur - 1
          else if (e.key === 'ArrowDown') next = cur + cols
          else if (e.key === 'ArrowUp') next = cur - cols
          return Math.max(0, Math.min(files.length - 1, next))
        })
      } else if (e.key === 'Enter') {
        if (focusedFileIndex !== null && gridRef.current) {
          const cards = gridRef.current.querySelectorAll('.hv-card')
          cards[focusedFileIndex]?.click()
        }
      } else if (e.key === 'Insert' || e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        setViewMode(prev => {
          const idx = VIEW_MODES.findIndex(m => m.key === prev)
          const next = VIEW_MODES[(idx + 1) % VIEW_MODES.length].key
          localStorage.setItem(VIEW_MODE_KEY, next)
          return next
        })
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        setViewMode(prev => {
          const idx = VIEW_MODES.findIndex(m => m.key === prev)
          const next = VIEW_MODES[(idx - 1 + VIEW_MODES.length) % VIEW_MODES.length].key
          localStorage.setItem(VIEW_MODE_KEY, next)
          return next
        })
      } else if (e.key === ' ') {
        e.preventDefault()
        const idx = focusedFileIndex ?? 0
        const f = files[idx]
        setSelectionMode(true)
        if (f) {
          setSelectedMap(new Map([[f.id, f]]))
          setFocusedFileIndex(idx)
          anchorIdxRef.current = idx
          anchorActionRef.current = true
        }
      } else if (e.key === 'Delete') {
        e.preventDefault()
        if (selectedIds.size > 0) handleDeletePreview()
        else handleDeleteAll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectionMode, totalPages, files, selectedIds, onBack, focusedFileIndex])

  useEffect(() => {
    if (!selectionMode) return
    function onKey(e) {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'SELECT') return

      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        toggleSelectionMode()
        return
      }
      if (e.key === 'Backspace' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault()
        handleDeleteHourPreview()
        return
      }
      if (e.key === 'Delete') {
        e.preventDefault()
        if (selectedIds.size > 0) handleDeletePreview()
        return
      }
      if (e.key === ' ') {
        e.preventDefault()
        const idx = focusedFileIndex ?? anchorIdxRef.current
        if (idx !== null && idx !== undefined && files[idx]) {
          const f = files[idx]
          setSelectedMap(prev => {
            const next = new Map(prev)
            const wasSelected = next.has(f.id)
            wasSelected ? next.delete(f.id) : next.set(f.id, f)
            anchorIdxRef.current = idx
            anchorActionRef.current = !wasSelected
            return next
          })
        }
        return
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
      if (files.length === 0) return
      e.preventDefault()
      const cols = getGridCols()
      const curIdx = focusedFileIndex ?? anchorIdxRef.current ?? 0
      let nextIdx = curIdx
      if (e.key === 'ArrowRight') nextIdx = curIdx + 1
      else if (e.key === 'ArrowLeft') nextIdx = curIdx - 1
      else if (e.key === 'ArrowDown') nextIdx = curIdx + cols
      else if (e.key === 'ArrowUp') nextIdx = curIdx - cols
      nextIdx = Math.max(0, Math.min(files.length - 1, nextIdx))
      if (nextIdx !== curIdx && anchorActionRef.current !== null) {
        setSelectedMap(prev => {
          const next = new Map(prev)
          const f = files[nextIdx]
          if (anchorActionRef.current) next.set(f.id, f)
          else next.delete(f.id)
          return next
        })
      }
      setFocusedFileIndex(nextIdx)
      anchorIdxRef.current = nextIdx
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectionMode, files, selectedIds, focusedFileIndex])

  async function handleDeletePreview() {
    if (selectedIds.size === 0) return
    setPreviewLoading(true)
    setDeleteError(null)
    setDeleteSuccess(null)
    try {
      const data = await previewDelete([...selectedIds])
      setPreview(data)
    } catch (e) {
      setDeleteError(e.message)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleDeleteConfirm() {
    const allIds = [
      ...preview.selected.map(f => f.id),
      ...preview.related_videos.map(f => f.id),
    ]
    setDeleteLoading(true)
    setDeleteError(null)
    setDeleteSuccess(null)
    try {
      const allPreviewFiles = [...preview.selected, ...preview.related_videos]
      const firstName = allPreviewFiles[0]?.file_path?.split(/[\\/]/).pop()
      const extraCount = allPreviewFiles.length - 1

      const res = await confirmDelete(allIds)
      setPreview(null)
      setSelectionMode(false)
      setSelectedMap(new Map())
      anchorIdxRef.current = null
      anchorActionRef.current = null

      const parts = []
      if (res.photo_count) parts.push(`${res.photo_count} photo${res.photo_count !== 1 ? 's' : ''}`)
      if (res.video_count) parts.push(`${res.video_count} video${res.video_count !== 1 ? 's' : ''}`)
      const fileSummary = parts.length ? parts.join(' + ') : `${res.deleted.length} files`
      const thumbPart = res.thumbnails_deleted ? ` · ${res.thumbnails_deleted} thumbnail${res.thumbnails_deleted !== 1 ? 's' : ''} removed` : ''
      const freedPart = res.freed_bytes > 0 ? ` · freed ${formatBytes(res.freed_bytes)}` : ''
      const fileHint = firstName ? ` — ${firstName}${extraCount > 0 ? ` +${extraCount}` : ''}` : ''

      if (res.failed?.length > 0) {
        setDeleteError(`Deleted ${fileSummary}${thumbPart}${freedPart}${fileHint}. ${res.failed.length} could not be removed from disk.`)
      } else {
        setDeleteSuccess(`Deleted ${fileSummary}${thumbPart}${freedPart}${fileHint}`)
      }
      setInternalRefreshKey(k => k + 1)
      onFilesDeleted?.()
    } catch (e) {
      setDeleteError(e.message)
    } finally {
      setDeleteLoading(false)
    }
  }

  // Reset focused file when page content changes
  useEffect(() => { setFocusedFileIndex(null) }, [files])

  // Load AI analysis for current page photos
  useEffect(() => {
    const ids = files.filter(f => f.file_type === 'photo').map(f => f.id)
    if (!ids.length) { setAiAnalysisMap(new Map()); return }
    getAiAnalysis(ids)
      .then(rows => setAiAnalysisMap(new Map(rows.map(r => [r.file_id, r]))))
      .catch(() => {})
  }, [files])

  function reloadAiAnalysis() {
    const ids = files.filter(f => f.file_type === 'photo').map(f => f.id)
    if (!ids.length) return
    getAiAnalysis(ids)
      .then(rows => setAiAnalysisMap(new Map(rows.map(r => [r.file_id, r]))))
      .catch(() => {})
  }

  function getGridCols() {
    if (!gridRef.current) return 4
    const cards = gridRef.current.querySelectorAll('.hv-card')
    if (cards.length < 2) return 1
    const firstTop = cards[0].getBoundingClientRect().top
    let cols = 0
    for (const card of cards) {
      if (Math.round(card.getBoundingClientRect().top) !== Math.round(firstTop)) break
      cols++
    }
    return Math.max(1, cols)
  }

  async function handleDeleteAll() {
    if (files.length === 0) return
    setPreviewLoading(true)
    setDeleteError(null)
    setDeleteSuccess(null)
    try {
      const data = await previewDelete(files.map(f => f.id))
      setPreview(data)
    } catch (e) {
      setDeleteError(e.message)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleDeleteHourPreview() {
    setHourPreviewLoading(true)
    setHourDeleteError(null)
    try {
      const data = await previewDeleteRange(cameraId, dateFrom, dateTo)
      setHourPreview(data)
    } catch (e) {
      setHourDeleteError(e.message)
    } finally {
      setHourPreviewLoading(false)
    }
  }

  async function handleDeleteHourConfirm() {
    const allIds = [
      ...hourPreview.selected.map(f => f.id),
      ...hourPreview.related_videos.map(f => f.id),
    ]
    setHourDeleteLoading(true)
    setHourDeleteError(null)
    try {
      await confirmDelete(allIds)
      setHourPreview(null)
      onFilesDeleted?.()
      onBack()
    } catch (e) {
      setHourDeleteError(e.message)
    } finally {
      setHourDeleteLoading(false)
    }
  }

  function handleViewModeChange(e) {
    const v = e.target.value
    setViewMode(v)
    localStorage.setItem(VIEW_MODE_KEY, v)
  }

  function handleModeParamChange(modeKey, paramKey, value) {
    setModeParams(prev => {
      const next = { ...prev, [modeKey]: { ...prev[modeKey], [paramKey]: value } }
      saveModeParams(modeKey, next[modeKey])
      return next
    })
  }

  const activeMode = VIEW_MODES.find(m => m.key === viewMode) ?? VIEW_MODES[0]
  const activeModeParams = modeParams[viewMode] ?? {}

  return (
    <div className="hv-root">
      {/* Header with inline pagination */}
      <div className="hv-header">
        <button className="hv-back-btn" onClick={onBack}>
          <i className="mdi mdi-arrow-left" /> Back
        </button>
        <span className="hv-title">
          <i className="mdi mdi-clock-outline" /> {label}
        </span>

        {totalPages > 1 && (
          <div className="hv-header-pag">
            <button className="hv-page-btn" onClick={() => setPage(1)} disabled={page === 1}>
              <i className="mdi mdi-chevron-double-left" />
            </button>
            <button className="hv-page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
              <i className="mdi mdi-chevron-left" />
            </button>
            <span className="hv-page-info">{page} / {totalPages}</span>
            <button className="hv-page-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>
              <i className="mdi mdi-chevron-right" />
            </button>
            <button className="hv-page-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>
              <i className="mdi mdi-chevron-double-right" />
            </button>
          </div>
        )}

        <select className="hv-view-mode-select" value={viewMode} onChange={handleViewModeChange}>
          {VIEW_MODES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>

        {!selectionMode && total > 0 && (
          <button
            className="hv-select-btn"
            style={{ color: '#f87171' }}
            onClick={handleDeleteHourPreview}
            disabled={hourPreviewLoading}
            title="Delete all files in this hour (Backspace)"
          >
            {hourPreviewLoading
              ? <i className="mdi mdi-loading mdi-spin" />
              : <><i className="mdi mdi-delete-sweep-outline" /> Delete hour</>
            }
          </button>
        )}

        <button
          className={`hv-select-btn${selectionMode ? ' active' : ''}`}
          onClick={toggleSelectionMode}
        >
          <i className={`mdi mdi-${selectionMode ? 'close' : 'checkbox-multiple-marked-outline'}`} />
          {selectionMode ? 'Cancel' : 'Select'}
        </button>

        <span className="hv-count">{total.toLocaleString()} files</span>
      </div>

      {/* Mode settings panel */}
      {!peekOriginal && activeMode.isAiMode && (
        <AiModePanel
          provider={activeMode.aiProvider}
          files={files}
          selectedIds={selectedIds}
          aiAnalysisMap={aiAnalysisMap}
          statsKey={aiStatsKey}
          onRun={() => {
            if (activeMode.aiProvider === 'claude') {
              setClaudeOpen(true)
            } else {
              setGeminiStructured(true)
              setGeminiOpen(true)
            }
          }}
        />
      )}
      {!peekOriginal && !activeMode.isAiMode && activeMode.params?.length > 0 && (
        <ModeSettingsPanel
          mode={activeMode}
          params={activeModeParams}
          onChange={(paramKey, value) => handleModeParamChange(viewMode, paramKey, value)}
        />
      )}
      {peekOriginal && (
        <div className="hv-peek-banner">
          <i className="mdi mdi-eye-outline" /> Просмотр оригиналов — удерживайте N
        </div>
      )}

      {/* Distribution chart */}
      {distribution.length > 0 && (
        <DistributionChart
          buckets={distribution}
          pageSize={pageSize}
          page={page}
          total={total}
          onGoToPage={setPage}
          hourStats={hourStats}
        />
      )}

      {/* Selection bar (horizontal, below chart) */}
      {selectionMode && (
        <SelectionBar
          files={files}
          selectedCount={selectedIds.size}
          selectionStats={selectionStats}
          onSelectAll={() => setSelectedMap(new Map(files.map(f => [f.id, f])))}
          onSelectNone={() => setSelectedMap(new Map())}
          onDelete={handleDeletePreview}
          onCancel={toggleSelectionMode}
          loading={previewLoading}
        />
      )}

      {/* File grid */}
      {loading ? (
        <div className="hv-grid" style={{ '--thumb-w': `${thumbWidth}px` }}>
          {Array.from({ length: Math.min(pageSize, 12) }).map((_, i) => (
            <div key={i} className="hv-card hv-card-skeleton skeleton" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <div className="hv-empty">
          <i className="mdi mdi-folder-open-outline" /> No files in this hour.
        </div>
      ) : (
        <div ref={gridRef} className="hv-grid" style={{ '--thumb-w': `${thumbWidth}px` }}>
          {files.map((file, index) =>
            file.file_type === 'video'
              ? <VideoCard
                  key={file.id}
                  file={file}
                  index={index}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(file.id)}
                  onToggle={toggleSelect}
                  isFocused={index === focusedFileIndex}
                />
              : <PhotoCard
                  key={file.id}
                  file={file}
                  index={index}
                  hoverZoom={hoverZoom}
                  mode={peekOriginal ? VIEW_MODES[0] : activeMode}
                  pagePhotoIds={pagePhotoIds}
                  params={peekOriginal ? {} : activeModeParams}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(file.id)}
                  onToggle={toggleSelect}
                  isFocused={index === focusedFileIndex}
                  aiData={aiAnalysisMap.get(file.id) ?? null}
                />
          )}
        </div>
      )}

      {deleteError && !preview && !hourPreview && (
        <div className="hv-delete-error">
          <i className="mdi mdi-alert-circle-outline" /> {deleteError}
        </div>
      )}
      {deleteSuccess && !preview && !hourPreview && (
        <div className="hv-delete-success">
          <i className="mdi mdi-check-circle-outline" /> {deleteSuccess}
        </div>
      )}
      {hourDeleteError && !hourPreview && (
        <div className="hv-delete-error">
          <i className="mdi mdi-alert-circle-outline" /> {hourDeleteError}
        </div>
      )}

      {preview && (
        <DeleteConfirmModal
          preview={preview}
          onConfirm={handleDeleteConfirm}
          onCancel={() => { setPreview(null); setDeleteError(null); setDeleteSuccess(null) }}
          busy={deleteLoading}
          error={deleteError}
          camera={camera}
        />
      )}

      {hourPreview && (
        <DeleteConfirmModal
          preview={hourPreview}
          onConfirm={handleDeleteHourConfirm}
          onCancel={() => { setHourPreview(null); setHourDeleteError(null) }}
          busy={hourDeleteLoading}
          error={hourDeleteError}
          camera={camera}
        />
      )}

      {geminiOpen && (() => {
        const photoFiles = files.filter(f => f.file_type === 'photo')
        const ids = selectedIds.size > 0
          ? photoFiles.filter(f => selectedIds.has(f.id)).map(f => f.id)
          : photoFiles.map(f => f.id)
        return (
          <GeminiAnalysisModal
            fileIds={ids}
            structured={geminiStructured}
            onClose={() => { setGeminiOpen(false); setGeminiStructured(false) }}
            onComplete={() => { recordAiRequest('gemini'); setAiStatsKey(k => k + 1); reloadAiAnalysis() }}
          />
        )
      })()}

      {claudeOpen && (() => {
        const photoFiles = files.filter(f => f.file_type === 'photo')
        const ids = selectedIds.size > 0
          ? photoFiles.filter(f => selectedIds.has(f.id)).map(f => f.id)
          : photoFiles.map(f => f.id)
        return (
          <ClaudeAnalysisModal
            fileIds={ids}
            onClose={() => setClaudeOpen(false)}
            onComplete={() => { recordAiRequest('claude'); setAiStatsKey(k => k + 1); reloadAiAnalysis() }}
          />
        )
      })()}

      <div style={{
        fontSize: 'calc(var(--font-base) * 0.72)',
        color: 'var(--text-dim)',
        textAlign: 'center',
        paddingTop: 4,
        userSelect: 'none',
      }}>
        {selectionMode ? (
          <>
            <Kbd>↑ ↓ ← →</Kbd> navigate + extend &nbsp;·&nbsp;
            <Kbd>Space</Kbd> toggle item &nbsp;·&nbsp;
            <Kbd>Shift+click</Kbd> range &nbsp;·&nbsp;
            <Kbd>Delete</Kbd> delete selected &nbsp;·&nbsp;
            <Kbd>⌫</Kbd> delete hour &nbsp;·&nbsp;
            <Kbd>Esc</Kbd> exit
          </>
        ) : (
          <>
            <Kbd>↑ ↓ ← →</Kbd> navigate &nbsp;·&nbsp;
            <Kbd>Enter</Kbd> open &nbsp;·&nbsp;
            <Kbd>PgUp PgDn</Kbd> page &nbsp;·&nbsp;
            <Kbd>M</Kbd> / <Kbd>P</Kbd> mode ±1 &nbsp;·&nbsp;
            <Kbd>N</Kbd> peek original &nbsp;·&nbsp;
            <Kbd>Space</Kbd> select &nbsp;·&nbsp;
            <Kbd>Del</Kbd> delete &nbsp;·&nbsp;
            <Kbd>⌫</Kbd> delete hour &nbsp;·&nbsp;
            <Kbd>Esc</Kbd> back
          </>
        )}
      </div>
    </div>
  )
}

function Kbd({ children }) {
  return (
    <kbd style={{
      background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '3px', padding: '0px 4px',
      fontSize: 'inherit', fontFamily: 'inherit',
    }}>{children}</kbd>
  )
}
