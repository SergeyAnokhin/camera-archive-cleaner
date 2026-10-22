import { formatBytes } from './hourUtils.js'
import './SelectionBar.css'

// Horizontal toolbar shown below the distribution chart while in selection mode.
// `presets` = [{ id, label, count, hint }] — "select files without these objects" buttons (Tools → View).
export default function SelectionBar({ files, selectedCount, selectionStats, presets = [], onSelectAll, onSelectNone, onSelectPreset, onDelete, onCancel, loading }) {
  return (
    <div className="hv-select-bar">
      <button className="hv-sbar-btn" onClick={onSelectAll}>
        <i className="mdi mdi-select-all" /> All ({files.length})
      </button>
      <button className="hv-sbar-btn" onClick={onSelectNone} disabled={selectedCount === 0}>
        <i className="mdi mdi-select-off" /> None
      </button>
      {presets.map(p => (
        <button key={p.id} className="hv-sbar-btn" onClick={() => onSelectPreset(p.id)}
          disabled={p.count === 0} title={p.hint}>
          <i className="mdi mdi-eye-off-outline" /> {p.label} ({p.count})
        </button>
      ))}
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
