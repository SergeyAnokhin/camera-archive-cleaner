import { useState, useEffect, useRef, useMemo } from 'react'
import { getFiles, getDistribution, getStatsTotal, getThumbnailUrl, getDiffThumbnailUrl, getMediaUrl, previewDelete, confirmDelete } from '../api.js'
import DeleteConfirmModal from './DeleteConfirmModal.jsx'
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
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
            <button className="hv-video-error-btn" onClick={openExternal}>
              <i className="mdi mdi-open-in-new" /> Open with external app
            </button>
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

function PhotoCard({ file, hoverZoom, viewMode, pagePhotoIds, diffThreshold, selectionMode, selected, onToggle, index }) {
  const [loaded, setLoaded]         = useState(false)
  const [error, setError]           = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const src = viewMode === 'motion_diff' && pagePhotoIds.length > 0
    ? getDiffThumbnailUrl(file.id, pagePhotoIds, diffThreshold)
    : getThumbnailUrl(file.id)

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
        className={`hv-card hv-card-photo${selectionMode && selected ? ' hv-selected' : ''}`}
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

function VideoCard({ file, selectionMode, selected, onToggle, index }) {
  const [modalOpen, setModalOpen] = useState(false)

  function handleClick(e) {
    if (selectionMode) { onToggle(file, index, e.shiftKey) } else { setModalOpen(true) }
  }

  return (
    <>
      <div
        className={`hv-card hv-card-video${selectionMode && selected ? ' hv-selected' : ''}`}
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
          {selectionStats.bytes > 0 && <span>{formatBytes(selectionStats.bytes)}</span>}
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
// Distribution chart  (60 bars = 1 per minute)
// ---------------------------------------------------------------------------

function DistributionChart({ buckets, pageSize, page, total, onGoToPage, hourStats }) {
  const chartRef = useRef(null)
  const maxCount  = useMemo(() => Math.max(...buckets.map(b => b.total_count), 1), [buckets])
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // cumulative[i] = total files in buckets 0..i-1
  const cumulative = useMemo(() => {
    const result = [0]
    for (const b of buckets) result.push(result[result.length - 1] + b.total_count)
    return result
  }, [buckets])

  // Which minute range does the current page cover?
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
    const rect   = chartRef.current.getBoundingClientRect()
    const frac   = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    let idx      = Math.floor(frac * 60)

    // If bucket is empty, find nearest non-empty
    if (buckets[idx]?.total_count === 0) {
      let found = false
      for (let d = 1; d < 60 && !found; d++) {
        if (idx + d < 60 && buckets[idx + d]?.total_count > 0) { idx = idx + d; found = true }
        else if (idx - d >= 0 && buckets[idx - d]?.total_count > 0) { idx = idx - d; found = true }
      }
      if (!found) return
    }

    const targetPage = Math.floor(cumulative[idx] / pageSize) + 1
    onGoToPage(targetPage)
  }

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
        {buckets.map((b, i) => {
          const showLabel = i % 15 === 0
          const hPct      = b.total_count > 0 ? Math.max((b.total_count / maxCount) * 100, 4) : 0
          return (
            <div key={i} className={`hv-dist-col${b.total_count === 0 ? ' empty' : ''}`}>
              <div className="hv-dist-bar-wrap">
                {b.total_count > 0 && <div className="hv-dist-bar" style={{ height: `${hPct}%` }} />}
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

export default function HourViewer({ cameraId, dateFrom, dateTo, label, onBack, onFilesDeleted }) {
  const [files, setFiles]               = useState([])
  const [total, setTotal]               = useState(0)
  const [page, setPage]                 = useState(1)
  const [loading, setLoading]           = useState(false)
  const [pageSize, setPageSize]         = useState(getPageSize)
  const [hoverZoom, setHoverZoom]       = useState(getHoverZoom)
  const [thumbWidth, setThumbWidth]     = useState(getThumbWidth)
  const [diffThreshold, setDiffThreshold] = useState(getDiffThreshold)
  const [viewMode, setViewMode]         = useState(() => localStorage.getItem(VIEW_MODE_KEY) || 'normal')
  const [distribution, setDistribution] = useState([])
  const [hourStats, setHourStats]       = useState(null)

  const [selectionMode, setSelectionMode]     = useState(false)
  const [selectedMap, setSelectedMap]         = useState(new Map())
  const [preview, setPreview]                 = useState(null)
  const [previewLoading, setPreviewLoading]   = useState(false)
  const [deleteLoading, setDeleteLoading]     = useState(false)
  const [deleteError, setDeleteError]         = useState(null)
  const [internalRefreshKey, setInternalRefreshKey] = useState(0)

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
    if (!selectionMode) return
    function onKey(e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (anchorIdxRef.current === null) return
      const nextIdx = e.key === 'ArrowLeft' ? anchorIdxRef.current - 1 : anchorIdxRef.current + 1
      if (nextIdx < 0 || nextIdx >= files.length) return
      e.preventDefault()
      setSelectedMap(prev => {
        const map = new Map(prev)
        if (anchorActionRef.current) map.set(files[nextIdx].id, files[nextIdx])
        else map.delete(files[nextIdx].id)
        return map
      })
      anchorIdxRef.current = nextIdx
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectionMode, files])

  async function handleDeletePreview() {
    if (selectedIds.size === 0) return
    setPreviewLoading(true)
    setDeleteError(null)
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
    try {
      const res = await confirmDelete(allIds)
      setPreview(null)
      setSelectionMode(false)
      setSelectedMap(new Map())
      anchorIdxRef.current = null
      anchorActionRef.current = null
      if (res.failed?.length > 0) {
        setDeleteError(`Deleted ${res.deleted.length} files. ${res.failed.length} could not be removed from disk.`)
      }
      setInternalRefreshKey(k => k + 1)
      onFilesDeleted?.()
    } catch (e) {
      setDeleteError(e.message)
    } finally {
      setDeleteLoading(false)
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
          <option value="normal">Normal</option>
          <option value="motion_diff">Motion diff</option>
        </select>

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
        <div className="hv-grid" style={{ '--thumb-w': `${thumbWidth}px` }}>
          {files.map((file, index) =>
            file.file_type === 'video'
              ? <VideoCard
                  key={file.id}
                  file={file}
                  index={index}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(file.id)}
                  onToggle={toggleSelect}
                />
              : <PhotoCard
                  key={file.id}
                  file={file}
                  index={index}
                  hoverZoom={hoverZoom}
                  viewMode={viewMode}
                  pagePhotoIds={pagePhotoIds}
                  diffThreshold={diffThreshold}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(file.id)}
                  onToggle={toggleSelect}
                />
          )}
        </div>
      )}

      {deleteError && !preview && (
        <div className="hv-delete-error">
          <i className="mdi mdi-alert-circle-outline" /> {deleteError}
        </div>
      )}

      {preview && (
        <DeleteConfirmModal
          preview={preview}
          onConfirm={handleDeleteConfirm}
          onCancel={() => { setPreview(null); setDeleteError(null) }}
          busy={deleteLoading}
          error={deleteError}
        />
      )}
    </div>
  )
}
