import { useState, useEffect, useRef } from 'react'
import VideoModal from './VideoModal.jsx'
import { formatTime } from './hourUtils.js'
import { getVideoThumbnailUrl } from '../../api.js'
import './VideoCard.css'

function readPreviewMode() {
  return localStorage.getItem('video_preview_mode') || 'none'
}

export default function VideoCard({ file, selectionMode, selected, onToggle, index, isFocused }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [previewMode, setPreviewMode] = useState(readPreviewMode)
  const [thumbError, setThumbError] = useState(false)
  const cardRef = useRef(null)

  useEffect(() => {
    if (isFocused) cardRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [isFocused])

  useEffect(() => {
    function onModeChange(e) { setPreviewMode(e.detail); setThumbError(false) }
    document.addEventListener('video-preview-mode-change', onModeChange)
    return () => document.removeEventListener('video-preview-mode-change', onModeChange)
  }, [])

  function handleClick(e) {
    if (selectionMode) { onToggle(file, index, e.shiftKey) } else { setModalOpen(true) }
  }

  const showThumb = previewMode !== 'none' && !thumbError
  const thumbUrl = showThumb ? getVideoThumbnailUrl(file.id, previewMode) : null

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
        {showThumb ? (
          <img
            src={thumbUrl}
            className="hv-video-thumb"
            alt=""
            draggable={false}
            onError={() => setThumbError(true)}
          />
        ) : (
          <i className="mdi mdi-video hv-video-icon" />
        )}
        <span className="hv-card-time hv-video-time-overlay">{formatTime(file.timestamp)}</span>
        {showThumb && <i className="mdi mdi-video hv-video-badge" />}
      </div>
      {!selectionMode && modalOpen && <VideoModal file={file} onClose={() => setModalOpen(false)} />}
    </>
  )
}
