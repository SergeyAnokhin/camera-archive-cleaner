import { useState, useEffect, useRef } from 'react'
import { getMediaUrl, getThumbnailUrl } from '../../api.js'
import { formatTime } from './hourUtils.js'
import './Lightbox.css'

function triggerDownload(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
}

function makeOrigName(file) {
  const ext = file.file_path?.slice(file.file_path.lastIndexOf('.')) || '.jpg'
  const stamp = (file.timestamp || '').replace(/[:T]/g, '-')
  return `snapshot_${stamp}${ext}`
}

function makeThumbName(file) {
  const stamp = (file.timestamp || '').replace(/[:T]/g, '-')
  return `snapshot_${stamp}_thumb.jpg`
}

export default function Lightbox({ files, index, onClose, onNavigate }) {
  const [videoError, setVideoError] = useState(false)
  const videoRef = useRef(null)
  const touchRef = useRef(null)

  const file = files[index]
  const isVideo = file?.file_type === 'video'
  const mediaUrl = file ? getMediaUrl(file.id) : null
  const thumbUrl = (!isVideo && file) ? getThumbnailUrl(file.id) : null

  useEffect(() => { setVideoError(false) }, [index])

  useEffect(() => {
    if (!file) return
    function onKey(e) {
      const tag = document.activeElement?.tagName

      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.stopImmediatePropagation()
        onClose()
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        e.stopImmediatePropagation()
        if (index > 0) onNavigate(index - 1)
        return
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopImmediatePropagation()
        if (index < files.length - 1) onNavigate(index + 1)
        return
      }
      if ((e.key === 's' || e.key === 'S') && tag !== 'INPUT') {
        e.preventDefault()
        if (mediaUrl) triggerDownload(mediaUrl, makeOrigName(file))
        return
      }
      if ((e.key === 't' || e.key === 'T') && !isVideo && thumbUrl && tag !== 'INPUT') {
        e.preventDefault()
        triggerDownload(thumbUrl, makeThumbName(file))
        return
      }
      if (isVideo && e.key === ' ') {
        e.preventDefault()
        e.stopPropagation()
        const v = videoRef.current
        if (v && !videoError) v.paused ? v.play() : v.pause()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [file, index, files.length, isVideo, mediaUrl, thumbUrl, onClose, onNavigate, videoError])

  function onTouchStart(e) {
    const t = e.touches[0]
    touchRef.current = { x: t.clientX, y: t.clientY }
  }

  function onTouchEnd(e) {
    const start = touchRef.current
    touchRef.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    if (dx < 0 && index < files.length - 1) onNavigate(index + 1)
    if (dx > 0 && index > 0) onNavigate(index - 1)
  }

  if (!file) return null

  return (
    <div className="lb-overlay" onClick={onClose}>
      <div className="lb-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="lb-header">
          <button
            className="lb-nav-btn"
            onClick={() => index > 0 && onNavigate(index - 1)}
            disabled={index === 0}
            title="Previous (←)"
          >
            <i className="mdi mdi-chevron-left" />
          </button>
          <button
            className="lb-nav-btn"
            onClick={() => index < files.length - 1 && onNavigate(index + 1)}
            disabled={index === files.length - 1}
            title="Next (→)"
          >
            <i className="mdi mdi-chevron-right" />
          </button>
          <span className="lb-counter">{index + 1} / {files.length}</span>

          <span className="lb-title">
            <i className={`mdi mdi-${isVideo ? 'video' : 'image'}`} />
            {formatTime(file.timestamp)}
          </span>

          <div className="lb-actions">
            {!isVideo && thumbUrl && (
              <a
                className="lb-action-btn"
                href={thumbUrl}
                download={makeThumbName(file)}
                onClick={e => e.stopPropagation()}
                title="Download preview (T)"
              >
                <i className="mdi mdi-image-size-select-small" /> Preview
              </a>
            )}
            <a
              className="lb-action-btn"
              href={mediaUrl}
              download={makeOrigName(file)}
              onClick={e => e.stopPropagation()}
              title="Download original (S)"
            >
              <i className="mdi mdi-download" /> Original
            </a>
            <button className="lb-action-btn" onClick={onClose} title="Close (Esc)">
              <i className="mdi mdi-close" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="lb-content" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {isVideo ? (
            videoError ? (
              <div className="lb-video-error">
                <i className="mdi mdi-alert-circle-outline lb-video-error-icon" />
                <p>This video cannot be played in the browser</p>
                <div className="lb-video-cmd">
                  <code>vlc &quot;{file.file_path}&quot;</code>
                  <button
                    className="lb-video-cmd-copy"
                    title="Copy to clipboard"
                    onClick={() => navigator.clipboard.writeText(`vlc "${file.file_path}"`)}
                  >
                    <i className="mdi mdi-content-copy" />
                  </button>
                </div>
              </div>
            ) : (
              <video
                ref={videoRef}
                className="lb-video"
                src={mediaUrl}
                controls
                autoPlay
                key={file.id}
                onError={() => setVideoError(true)}
              />
            )
          ) : (
            <img
              className="lb-photo"
              src={mediaUrl}
              alt={formatTime(file.timestamp)}
              key={file.id}
            />
          )}
        </div>

        {/* Keyboard hints */}
        <div className="lb-hints">
          <Kbd>←</Kbd> / <Kbd>→</Kbd> navigate
          &nbsp;·&nbsp;
          <Kbd>S</Kbd> save original
          {!isVideo && <>&nbsp;·&nbsp;<Kbd>T</Kbd> save preview</>}
          {isVideo && <>&nbsp;·&nbsp;<Kbd>Space</Kbd> play/pause</>}
          &nbsp;·&nbsp;
          <Kbd>Esc</Kbd> close
        </div>
      </div>
    </div>
  )
}

function Kbd({ children }) {
  return <kbd className="lb-kbd">{children}</kbd>
}
