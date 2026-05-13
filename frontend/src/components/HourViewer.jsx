import { useState, useEffect, useRef, useMemo } from 'react'
import { getFiles, getDistribution, getStatsTotal, getMediaUrl, previewDelete, confirmDelete, deleteByRange } from '../api.js'
import DeleteConfirmModal from './DeleteConfirmModal.jsx'
import { VIEW_MODES, DEFAULT_VIEW_MODE_KEY } from './viewModes/index.js'
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

function getPageSize()     { return Number(localStorage.getItem(PAGE_SIZE_KEY)) || PAGE_SIZE_DEFAULT }
function getHoverZoom()    { return Number(localStorage.getItem(ZOOM_KEY)) || ZOOM_DEFAULT }
function getThumbWidth()   { return Number(localStorage.getItem(THUMB_WIDTH_KEY)) || THUMB_WIDTH_DEFAULT }
function getDiffThreshold() {
  const v = localStorage.getItem(DIFF_THRESHOLD_KEY)
  return v !== null ? Number(v) : DIFF_THRESHOLD_DEFAULT
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

function PhotoCard({ file, hoverZoom, mode, pagePhotoIds, diffThreshold, selectionMode, selected, onToggle, index, isFocused }) {
  const [loaded, setLoaded]         = useState(false)
  const [error, setError]           = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
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

  const src = mode.getImageUrl(file, { pagePhotoIds, diffThreshold })

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
  const [diffThreshold, setDiffThreshold] = useState(getDiffThreshold)
  const [viewMode, setViewMode]         = useState(() => localStorage.getItem(VIEW_MODE_KEY) || DEFAULT_VIEW_MODE_KEY)
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
  const [deleteHourConfirm, setDeleteHourConfirm] = useState(false)
  const [deleteHourLoading, setDeleteHourLoading] = useState(false)
  const [deleteHourError, setDeleteHourError] = useState(null)

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
    function onPageSize()      { setPageSize(getPageSize()); setPage(1) }
    function onZoom()          { setHoverZoom(getHoverZoom()) }
    function onThumbWidth()    { setThumbWidth(getThumbWidth()) }
    function onDiffThreshold() { setDiffThreshold(getDiffThreshold()) }
    document.addEventListener('hour-page-size-change', onPageSize)
    document.addEventListener('hover-zoom-change', onZoom)
    document.addEventListener('thumb-width-change', onThumbWidth)
    document.addEventListener('diff-threshold-change', onDiffThreshold)
    return () => {
      document.removeEventListener('hour-page-size-change', onPageSize)
      document.removeEventListener('hover-zoom-change', onZoom)
      document.removeEventListener('thumb-width-change', onThumbWidth)
      document.removeEventListener('diff-threshold-change', onDiffThreshold)
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
      if (e.key === 'Escape' || e.key === 'Backspace') {
        if (e.key === 'Backspace' && (tag === 'INPUT' || tag === 'TEXTAREA')) return
        e.preventDefault()
        e.stopImmediatePropagation()
        onBack()
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

      if (e.key === 'Escape' || e.key === 'Backspace') {
        if (e.key === 'Backspace' && (tag === 'INPUT' || tag === 'TEXTAREA')) return
        e.preventDefault()
        e.stopImmediatePropagation()
        toggleSelectionMode()
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

  async function handleDeleteHour() {
    setDeleteHourLoading(true)
    setDeleteHourError(null)
    try {
      await deleteByRange(cameraId, dateFrom, dateTo)
      setDeleteHourConfirm(false)
      onFilesDeleted?.()
      onBack()
    } catch (e) {
      setDeleteHourError(e.message)
    } finally {
      setDeleteHourLoading(false)
    }
  }

  function handleViewModeChange(e) {
    const v = e.target.value
    setViewMode(v)
    localStorage.setItem(VIEW_MODE_KEY, v)
  }

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
            onClick={() => { setDeleteHourConfirm(v => !v); setDeleteHourError(null) }}
            title="Delete all files in this hour"
          >
            <i className="mdi mdi-delete-sweep-outline" /> Delete hour
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

      {/* Delete hour confirmation bar */}
      {deleteHourConfirm && !selectionMode && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          background: '#450a0a', border: '1px solid #7f1d1d',
          borderRadius: 'var(--radius)', padding: '8px 14px',
        }}>
          <i className="mdi mdi-alert-outline" style={{ color: '#f87171' }} />
          <span style={{ color: '#fca5a5', fontSize: 'calc(var(--font-base) * 0.88)', flex: 1 }}>
            Delete all {total.toLocaleString()} files for this hour?
            {hourStats && ` · ${formatBytes(hourStats.total_size_bytes)}`}
          </span>
          {deleteHourError && <span style={{ color: '#fca5a5', fontSize: 'calc(var(--font-base) * 0.82)' }}>{deleteHourError}</span>}
          <button className="modal-btn danger" disabled={deleteHourLoading} onClick={handleDeleteHour}>
            {deleteHourLoading ? <i className="mdi mdi-loading mdi-spin" /> : <><i className="mdi mdi-delete-outline" /> Delete</>}
          </button>
          <button className="modal-btn neutral" disabled={deleteHourLoading} onClick={() => { setDeleteHourConfirm(false); setDeleteHourError(null) }}>
            Cancel
          </button>
        </div>
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
                  mode={VIEW_MODES.find(m => m.key === viewMode) ?? VIEW_MODES[0]}
                  pagePhotoIds={pagePhotoIds}
                  diffThreshold={diffThreshold}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(file.id)}
                  onToggle={toggleSelect}
                  isFocused={index === focusedFileIndex}
                />
          )}
        </div>
      )}

      {deleteError && !preview && (
        <div className="hv-delete-error">
          <i className="mdi mdi-alert-circle-outline" /> {deleteError}
        </div>
      )}
      {deleteSuccess && !preview && (
        <div className="hv-delete-success">
          <i className="mdi mdi-check-circle-outline" /> {deleteSuccess}
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
            <Kbd>Esc</Kbd> / <Kbd>⌫</Kbd> exit
          </>
        ) : (
          <>
            <Kbd>↑ ↓ ← →</Kbd> navigate &nbsp;·&nbsp;
            <Kbd>Enter</Kbd> open &nbsp;·&nbsp;
            <Kbd>PgUp PgDn</Kbd> page &nbsp;·&nbsp;
            <Kbd>M</Kbd> / <Kbd>Ins</Kbd> view mode &nbsp;·&nbsp;
            <Kbd>Space</Kbd> select &nbsp;·&nbsp;
            <Kbd>Del</Kbd> delete &nbsp;·&nbsp;
            <Kbd>Esc</Kbd> / <Kbd>⌫</Kbd> back
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
