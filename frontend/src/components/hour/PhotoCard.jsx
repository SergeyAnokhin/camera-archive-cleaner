import { useState, useEffect, useRef } from 'react'
import { getMediaUrl } from '../../api.js'
import { resolveAiIcons } from '../../aiHelpers.js'
import { formatTime } from './hourUtils.js'

export default function PhotoCard({ file, hoverZoom, mode, pagePhotoIds, params, selectionMode, selected, onToggle, index, isFocused, aiData, onImageLoad }) {
  const [loaded, setLoaded]         = useState(false)
  const [error, setError]           = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)
  const cardRef = useRef(null)
  const imgRef  = useRef(null)

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
    // If image was already in browser cache, `load` fires before React attaches
    // onLoad, leaving the image hidden forever. Check `complete` as a fallback.
    const img = imgRef.current
    if (img?.complete) {
      if (img.naturalWidth > 0) setLoaded(true)
      else setError(true)
    }
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
              ref={imgRef}
              src={src}
              alt={formatTime(file.timestamp)}
              className="hv-photo-img"
              style={{ display: loaded ? 'block' : 'none' }}
              onLoad={() => { setLoaded(true); onImageLoad?.() }}
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
