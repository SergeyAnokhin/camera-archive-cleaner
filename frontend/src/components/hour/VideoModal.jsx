import { useState, useEffect, useRef } from 'react'
import { getMediaUrl } from '../../api.js'
import { formatTime } from './hourUtils.js'
import './VideoModal.css'

export default function VideoModal({ file, onClose }) {
  const [videoError, setVideoError] = useState(false)
  const videoRef = useRef(null)
  const mediaUrl = getMediaUrl(file.id)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.stopImmediatePropagation()
        onClose()
        return
      }
      const video = videoRef.current
      if (!video || videoError) return
      if (e.key === ' ') {
        e.preventDefault()
        e.stopPropagation()
        video.paused ? video.play() : video.pause()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        video.currentTime = Math.min(video.duration || 0, video.currentTime + (video.duration || 0) / 5)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        e.stopPropagation()
        video.currentTime = Math.max(0, video.currentTime - (video.duration || 0) / 5)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, videoError])

  function openExternal() { window.open(mediaUrl, '_blank') }

  return (
    <div className="hv-lightbox hv-video-modal" onClick={onClose}>
      <div className="hv-video-modal-inner" onClick={e => e.stopPropagation()}>
        <div className="hv-video-modal-header">
          <span className="hv-video-modal-title">
            <i className="mdi mdi-video" /> {formatTime(file.timestamp)}
          </span>
          <div className="hv-video-modal-hint">Пробел — пауза · ← → — перемотка на 1/5</div>
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
            ref={videoRef}
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
