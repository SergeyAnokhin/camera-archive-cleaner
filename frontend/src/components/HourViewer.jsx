import { useState, useEffect, useRef, useMemo } from 'react'
import { getFiles, getDistribution, getThumbnailUrl, getMediaUrl } from '../api.js'
import './HourViewer.css'

const PAGE_SIZE_KEY = 'hour_page_size'
const PAGE_SIZE_DEFAULT = 50
const ZOOM_KEY = 'hover_zoom'
const ZOOM_DEFAULT = 1.5

function getPageSize() { return Number(localStorage.getItem(PAGE_SIZE_KEY)) || PAGE_SIZE_DEFAULT }
function getHoverZoom() { return Number(localStorage.getItem(ZOOM_KEY)) || ZOOM_DEFAULT }

function formatTime(ts) { return ts ? ts.substring(11, 19) : '' }

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

function PhotoCard({ file, hoverZoom }) {
  const [loaded, setLoaded]         = useState(false)
  const [error, setError]           = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  return (
    <>
      <div
        className="hv-card hv-card-photo"
        style={{ '--hv-zoom': hoverZoom }}
        title={`${formatTime(file.timestamp)} — click to enlarge`}
        onClick={() => setFullscreen(true)}
      >
        {!loaded && !error && <div className="hv-img-skeleton skeleton" />}
        {error
          ? <div className="hv-img-error"><i className="mdi mdi-image-broken-variant" /></div>
          : <img
              src={getThumbnailUrl(file.id)}
              alt={formatTime(file.timestamp)}
              className="hv-photo-img"
              style={{ display: loaded ? 'block' : 'none' }}
              onLoad={() => setLoaded(true)}
              onError={() => setError(true)}
            />
        }
        <span className="hv-card-time">{formatTime(file.timestamp)}</span>
      </div>
      {fullscreen && (
        <div className="hv-lightbox" onClick={() => setFullscreen(false)}>
          <img src={getMediaUrl(file.id)} alt={formatTime(file.timestamp)} className="hv-lightbox-img" />
        </div>
      )}
    </>
  )
}

function VideoCard({ file }) {
  const [modalOpen, setModalOpen] = useState(false)
  return (
    <>
      <div className="hv-card hv-card-video" onClick={() => setModalOpen(true)} title={`${formatTime(file.timestamp)} — click to play`}>
        <i className="mdi mdi-video hv-video-icon" />
        <span className="hv-card-time">{formatTime(file.timestamp)}</span>
      </div>
      {modalOpen && <VideoModal file={file} onClose={() => setModalOpen(false)} />}
    </>
  )
}

// ---------------------------------------------------------------------------
// Distribution chart  (60 bars = 1 per minute)
// ---------------------------------------------------------------------------

function DistributionChart({ buckets, pageSize, page, total, onGoToPage }) {
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

export default function HourViewer({ cameraId, dateFrom, dateTo, label, onBack }) {
  const [files, setFiles]               = useState([])
  const [total, setTotal]               = useState(0)
  const [page, setPage]                 = useState(1)
  const [loading, setLoading]           = useState(false)
  const [pageSize, setPageSize]         = useState(getPageSize)
  const [hoverZoom, setHoverZoom]       = useState(getHoverZoom)
  const [distribution, setDistribution] = useState([])

  useEffect(() => {
    function onPageSize() { setPageSize(getPageSize()); setPage(1) }
    function onZoom()     { setHoverZoom(getHoverZoom()) }
    document.addEventListener('hour-page-size-change', onPageSize)
    document.addEventListener('hover-zoom-change', onZoom)
    return () => {
      document.removeEventListener('hour-page-size-change', onPageSize)
      document.removeEventListener('hover-zoom-change', onZoom)
    }
  }, [])

  useEffect(() => {
    getDistribution(cameraId, dateFrom, dateTo)
      .then(data => setDistribution(data.buckets ?? []))
      .catch(() => setDistribution([]))
  }, [cameraId, dateFrom, dateTo])

  useEffect(() => {
    setLoading(true)
    getFiles(cameraId, dateFrom, dateTo, page, pageSize)
      .then(data => { setFiles(data.files ?? []); setTotal(data.total ?? 0) })
      .catch(() => { setFiles([]); setTotal(0) })
      .finally(() => setLoading(false))
  }, [cameraId, dateFrom, dateTo, page, pageSize])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

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
        />
      )}

      {/* File grid */}
      {loading ? (
        <div className="hv-grid">
          {Array.from({ length: Math.min(pageSize, 12) }).map((_, i) => (
            <div key={i} className="hv-card hv-card-skeleton skeleton" />
          ))}
        </div>
      ) : files.length === 0 ? (
        <div className="hv-empty">
          <i className="mdi mdi-folder-open-outline" /> No files in this hour.
        </div>
      ) : (
        <div className="hv-grid">
          {files.map(file =>
            file.file_type === 'video'
              ? <VideoCard key={file.id} file={file} />
              : <PhotoCard key={file.id} file={file} hoverZoom={hoverZoom} />
          )}
        </div>
      )}
    </div>
  )
}
