import { useState, useEffect, useRef } from 'react'
import { resolveAiIcons } from '../../aiHelpers.js'
import { formatTime } from './hourUtils.js'
import './PhotoCard.css'

export default function PhotoCard({ file, hoverZoom, mode, pagePhotoIds, params, selectionMode, selected, onToggle, index, isFocused, aiData, onImageLoad, onOpenLightbox }) {
  const [loaded, setLoaded]         = useState(false)
  const [error, setError]           = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)
  const cardRef = useRef(null)
  const imgRef  = useRef(null)

  useEffect(() => {
    if (isFocused) cardRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [isFocused])

  const src = mode.getImageUrl(file, { pagePhotoIds, params })

  useEffect(() => {
    setLoaded(false)
    setError(false)
    const img = imgRef.current
    if (img?.complete) {
      if (img.naturalWidth > 0) setLoaded(true)
      else setError(true)
    }
  }, [src])

  function handleClick(e) {
    if (selectionMode) { onToggle(file, index, e.shiftKey) } else { onOpenLightbox?.(index) }
  }

  const aiIcons = aiData?.objects ? resolveAiIcons(aiData.objects) : []

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

        {/* AI analysis emoji — top-left corner */}
        {aiIcons.length > 0 && (
          <div className="hv-card-ai-icons">
            {aiIcons.slice(0, 5).map((ic, i) => (
              <span key={i} className="hv-card-ai-emoji" title={ic.label}>{ic.emoji}</span>
            ))}
            {aiIcons.length > 5 && <span className="hv-card-ai-more">+{aiIcons.length - 5}</span>}
          </div>
        )}

        {/* Objects text overlay — visible on hover (zoom) */}
        {aiIcons.length > 0 && !selectionMode && (
          <div className="hv-card-objects-hover">
            {aiIcons.map(ic => `${ic.emoji} ${ic.label}`).join('  ')}
          </div>
        )}

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
    </>
  )
}
