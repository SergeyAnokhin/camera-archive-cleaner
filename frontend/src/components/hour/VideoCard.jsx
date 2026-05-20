import { useState, useEffect, useRef } from 'react'
import VideoModal from './VideoModal.jsx'
import { formatTime } from './hourUtils.js'

export default function VideoCard({ file, selectionMode, selected, onToggle, index, isFocused }) {
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
