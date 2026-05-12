import './HeatmapGrid.css'
import HeatmapCell from './HeatmapCell.jsx'

const SKELETON_COUNTS = { year: 8, month: 12, day: 28, hour: 24 }

export default function HeatmapGrid({ periods, level, loading, onDrillInto, cameraId, previewsPerCell, contextDateFrom }) {
  if (loading) {
    const count = SKELETON_COUNTS[level] ?? 12
    return (
      <div className="heatmap-wrapper">
        <div className={`heatmap-grid level-${level}`}>
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="heatmap-cell-skeleton skeleton" />
          ))}
        </div>
      </div>
    )
  }

  if (!periods.length) {
    return (
      <div className="heatmap-wrapper">
        <div className="heatmap-empty">
          <i className="mdi mdi-database-off-outline" />
          No data for this period. Run a scan first.
        </div>
      </div>
    )
  }

  return (
    <div className="heatmap-wrapper">
      <div className={`heatmap-grid level-${level}`}>
        {periods.map(cell => (
          <HeatmapCell
            key={cell.period}
            cell={cell}
            level={level}
            onDrillInto={onDrillInto}
            cameraId={cameraId}
            previewsPerCell={previewsPerCell}
            contextDateFrom={contextDateFrom}
          />
        ))}
      </div>
    </div>
  )
}
