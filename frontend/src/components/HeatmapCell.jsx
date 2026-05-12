import './HeatmapCell.css'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function cellLabel(period, level) {
  if (level === 'year')  return period                          // "2023"
  if (level === 'month') return MONTH_NAMES[parseInt(period.split('-')[1], 10) - 1]  // "2023-08" → "Aug"
  if (level === 'day')   return period.split('-')[2]            // "2023-08-15" → "15"
  if (level === 'hour')  return `${period}:00`                  // "14" → "14:00"
  return period
}

function formatSize(gb) {
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  return `${(gb * 1024).toFixed(0)} MB`
}

export default function HeatmapCell({ cell, level, onDrillInto }) {
  const isLeaf = level === 'hour'
  const isEmpty = cell.bucket === 0

  const tooltip = isEmpty
    ? `${cellLabel(cell.period, level)}: no data`
    : `${cellLabel(cell.period, level)}: ${formatSize(cell.total_size_gb)} · ${cell.photo_count.toLocaleString()} photos · ${cell.video_count.toLocaleString()} videos`

  const isLight = cell.bucket >= 6

  return (
    <div
      className={`heatmap-cell${isLeaf ? ' no-drill' : ''}${isEmpty ? ' empty' : ''}${isLight ? ' light' : ''}`}
      style={{ backgroundColor: `var(--heat-${cell.bucket})` }}
      onClick={() => !isLeaf && onDrillInto(cell)}
      title={tooltip}
    >
      <span className="cell-label">{cellLabel(cell.period, level)}</span>
      {!isEmpty && (
        <span className="cell-sublabel">{formatSize(cell.total_size_gb)}</span>
      )}
    </div>
  )
}
