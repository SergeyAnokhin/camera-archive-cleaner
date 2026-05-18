import { useState, useEffect, useRef } from 'react'
import { getPreviews, getThumbnailUrl, getAiObjectsSummary } from '../api.js'
import { resolveAiIcons } from '../aiHelpers.js'
import './HeatmapCell.css'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function cellLabel(period, level) {
  if (level === 'year')  return period
  if (level === 'month') return MONTH_NAMES[parseInt(period.split('-')[1], 10) - 1]
  if (level === 'day')   return period.split('-')[2]
  if (level === 'hour')  return `${period}:00`
  return period
}

function formatSize(gb) {
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  return `${(gb * 1024).toFixed(0)} MB`
}

function fmtCount(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k'
  return String(n)
}

function dateRangeForCell(period, level, contextDateFrom) {
  if (level === 'year') {
    return { dateFrom: `${period}-01-01T00:00:00`, dateTo: `${period}-12-31T23:59:59` }
  }
  if (level === 'month') {
    const [y, m] = period.split('-')
    const lastDay = new Date(+y, +m, 0).getDate()
    return {
      dateFrom: `${period}-01T00:00:00`,
      dateTo: `${period}-${String(lastDay).padStart(2, '0')}T23:59:59`,
    }
  }
  if (level === 'day') {
    return { dateFrom: `${period}T00:00:00`, dateTo: `${period}T23:59:59` }
  }
  if (level === 'hour' && contextDateFrom) {
    const date = contextDateFrom.substring(0, 10)
    const h = period.padStart(2, '0')
    return { dateFrom: `${date}T${h}:00:00`, dateTo: `${date}T${h}:59:59` }
  }
  return null
}

export default function HeatmapCell({ cell, level, onDrillInto, cameraId, previewsPerCell, contextDateFrom, selectionMode, selected, onToggle, isFocused }) {
  const [previewIds, setPreviewIds] = useState([])
  const [aiObjects, setAiObjects]   = useState([])
  const cellRef = useRef(null)

  useEffect(() => {
    if (isFocused) cellRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [isFocused])

  const showPreviews = previewsPerCell > 0 && cell.photo_count > 0

  useEffect(() => {
    if (cell.bucket === 0) { setAiObjects([]); return }
    const range = dateRangeForCell(cell.period, level, contextDateFrom)
    if (!range) return
    let cancelled = false
    getAiObjectsSummary(cameraId, range.dateFrom, range.dateTo)
      .then(data => { if (!cancelled) setAiObjects(data.objects ?? []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [cell.period, level, cameraId, contextDateFrom, cell.bucket])

  useEffect(() => {
    if (!showPreviews) { setPreviewIds([]); return }
    const range = dateRangeForCell(cell.period, level, contextDateFrom)
    if (!range) return
    let cancelled = false
    getPreviews(cameraId, range.dateFrom, range.dateTo, previewsPerCell)
      .then(data => { if (!cancelled) setPreviewIds(data.file_ids ?? []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [cell.period, level, cameraId, previewsPerCell, showPreviews, contextDateFrom])

  const isEmpty = cell.bucket === 0
  const isLight = cell.bucket >= 6

  const tooltip = isEmpty
    ? `${cellLabel(cell.period, level)}: no data`
    : `${cellLabel(cell.period, level)}: ${formatSize(cell.total_size_gb)} · ${cell.photo_count.toLocaleString()} photos · ${cell.video_count.toLocaleString()} videos`

  return (
    <div
      ref={cellRef}
      className={`heatmap-cell${isEmpty ? ' empty' : ''}${isLight ? ' light' : ''}${selected ? ' heatmap-cell-selected' : ''}${isFocused ? ' heatmap-cell-focused' : ''}`}
      style={{ backgroundColor: `var(--heat-${cell.bucket})` }}
      onClick={() => selectionMode ? onToggle?.(cell) : onDrillInto(cell)}
      title={tooltip}
    >
      {selectionMode && !isEmpty && (
        <div className={`cell-checkbox${selected ? ' checked' : ''}`}>
          <i className={`mdi mdi-${selected ? 'checkbox-marked' : 'checkbox-blank-outline'}`} />
        </div>
      )}
      <span className="cell-label">{cellLabel(cell.period, level)}</span>
      {!isEmpty && (
        <span className="cell-sublabel">{formatSize(cell.total_size_gb)}</span>
      )}
      {!isEmpty && cell.photo_count > 0 && (
        <span className="cell-corner cell-corner-tl">
          <i className="mdi mdi-image-outline" />{fmtCount(cell.photo_count)}
        </span>
      )}
      {!isEmpty && cell.video_count > 0 && (
        <span className="cell-corner cell-corner-tr">
          <i className="mdi mdi-video-outline" />{fmtCount(cell.video_count)}
        </span>
      )}
      {previewIds.length > 0 && (
        <div className="cell-previews">
          {previewIds.map(id => (
            <img
              key={id}
              src={getThumbnailUrl(id)}
              className="cell-preview-img"
              alt=""
              loading="lazy"
            />
          ))}
        </div>
      )}
      {aiObjects.length > 0 && (() => {
        const allIcons = resolveAiIcons(aiObjects.join(' '))
        const shown = allIcons.slice(0, 5)
        return (
          <div className="cell-ai-icons">
            {shown.map((ic, i) => (
              <i key={i} className={`mdi ${ic.mdi}`} style={{ color: ic.color }} title={ic.label} />
            ))}
            {allIcons.length > 5 && <span className="cell-ai-more">+{allIcons.length - 5}</span>}
          </div>
        )
      })()}
    </div>
  )
}
