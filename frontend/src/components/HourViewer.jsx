import { useState, useEffect } from 'react'
import { getFiles, getThumbnailUrl, getMediaUrl } from '../api.js'
import './HourViewer.css'

const PAGE_SIZE_KEY = 'hour_page_size'
const PAGE_SIZE_DEFAULT = 50

function getPageSize() {
  return Number(localStorage.getItem(PAGE_SIZE_KEY)) || PAGE_SIZE_DEFAULT
}

function formatTime(timestamp) {
  return timestamp ? timestamp.substring(11, 19) : ''
}

function VideoModal({ file, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="hv-lightbox hv-video-modal" onClick={onClose}>
      <div className="hv-video-modal-inner" onClick={e => e.stopPropagation()}>
        <div className="hv-video-modal-header">
          <span className="hv-video-modal-title">
            <i className="mdi mdi-video" /> {formatTime(file.timestamp)}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <a
              className="hv-video-modal-btn"
              href={getMediaUrl(file.id)}
              download
              onClick={e => e.stopPropagation()}
            >
              <i className="mdi mdi-download" /> Download
            </a>
            <button className="hv-video-modal-btn" onClick={onClose}>
              <i className="mdi mdi-close" />
            </button>
          </div>
        </div>
        <video
          className="hv-video-fullplayer"
          src={getMediaUrl(file.id)}
          controls
          autoPlay
        />
      </div>
    </div>
  )
}

function VideoCard({ file }) {
  const [modalOpen, setModalOpen] = useState(false)
  return (
    <>
      <div
        className="hv-card hv-card-video"
        onClick={() => setModalOpen(true)}
        title={`${formatTime(file.timestamp)} — click to play`}
      >
        <i className="mdi mdi-video hv-video-icon" />
        <span className="hv-card-time">{formatTime(file.timestamp)}</span>
      </div>
      {modalOpen && <VideoModal file={file} onClose={() => setModalOpen(false)} />}
    </>
  )
}

function PhotoCard({ file }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError]   = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  return (
    <>
      <div
        className="hv-card hv-card-photo"
        title={`${formatTime(file.timestamp)} — click to enlarge`}
        onClick={() => setFullscreen(true)}
      >
        {!loaded && !error && <div className="hv-img-skeleton skeleton" />}
        {error ? (
          <div className="hv-img-error">
            <i className="mdi mdi-image-broken-variant" />
          </div>
        ) : (
          <img
            src={getThumbnailUrl(file.id)}
            alt={formatTime(file.timestamp)}
            className="hv-photo-img"
            style={{ display: loaded ? 'block' : 'none' }}
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
          />
        )}
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

export default function HourViewer({ cameraId, dateFrom, dateTo, label, onBack }) {
  const [files, setFiles]   = useState([])
  const [total, setTotal]   = useState(0)
  const [page, setPage]     = useState(1)
  const [loading, setLoading] = useState(false)
  const [pageSize, setPageSize] = useState(getPageSize)

  // Sync page size if changed from ToolsModal
  useEffect(() => {
    function onSettingChange() { setPageSize(getPageSize()); setPage(1) }
    document.addEventListener('hour-page-size-change', onSettingChange)
    return () => document.removeEventListener('hour-page-size-change', onSettingChange)
  }, [])

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
      {/* Header bar */}
      <div className="hv-header">
        <button className="hv-back-btn" onClick={onBack}>
          <i className="mdi mdi-arrow-left" /> Back
        </button>
        <span className="hv-title">
          <i className="mdi mdi-clock-outline" /> {label}
        </span>
        <span className="hv-count">{total.toLocaleString()} files</span>
      </div>

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
              : <PhotoCard key={file.id} file={file} />
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="hv-pagination">
          <button className="hv-page-btn" onClick={() => setPage(1)} disabled={page === 1}>
            <i className="mdi mdi-chevron-double-left" />
          </button>
          <button className="hv-page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
            <i className="mdi mdi-chevron-left" />
          </button>
          <span className="hv-page-info">Page {page} / {totalPages}</span>
          <button className="hv-page-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>
            <i className="mdi mdi-chevron-right" />
          </button>
          <button className="hv-page-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>
            <i className="mdi mdi-chevron-double-right" />
          </button>
        </div>
      )}
    </div>
  )
}
