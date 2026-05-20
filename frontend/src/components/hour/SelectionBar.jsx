import { formatBytes } from './hourUtils.js'

// Horizontal toolbar shown below the distribution chart while in selection mode.
export default function SelectionBar({ files, selectedCount, selectionStats, onSelectAll, onSelectNone, onDelete, onCancel, loading }) {
  return (
    <div className="hv-select-bar">
      <button className="hv-sbar-btn" onClick={onSelectAll}>
        <i className="mdi mdi-select-all" /> All ({files.length})
      </button>
      <button className="hv-sbar-btn" onClick={onSelectNone} disabled={selectedCount === 0}>
        <i className="mdi mdi-select-off" /> None
      </button>
      {selectedCount > 0 && (
        <div className="hv-sbar-stats">
          {selectionStats.photos > 0 && <span><i className="mdi mdi-image-outline" /> {selectionStats.photos}</span>}
          {selectionStats.videos > 0 && <span><i className="mdi mdi-video-outline" /> {selectionStats.videos}</span>}
          <span>{formatBytes(selectionStats.bytes)}</span>
        </div>
      )}
      <div className="hv-sbar-spacer" />
      <button
        className="hv-sbar-btn hv-sbar-danger"
        onClick={onDelete}
        disabled={loading || selectedCount === 0}
      >
        {loading
          ? <i className="mdi mdi-loading mdi-spin" />
          : <><i className="mdi mdi-delete-outline" /> Delete {selectedCount}</>
        }
      </button>
      <button className="hv-sbar-btn hv-sbar-cancel" onClick={onCancel}>
        <i className="mdi mdi-close" /> Cancel
      </button>
    </div>
  )
}
