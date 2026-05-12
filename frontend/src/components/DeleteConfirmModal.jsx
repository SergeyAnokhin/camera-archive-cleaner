import { useEffect } from 'react'
import './DeleteConfirmModal.css'

function formatTime(ts) { return ts ? ts.substring(11, 19) : '' }

function FileRow({ item }) {
  const parts = (item.file_path || '').replace(/\\/g, '/').split('/')
  const filename = parts.pop() || item.file_path
  const dir = parts.length ? parts.join('/') + '/' : ''
  return (
    <div className="dcm-file-row">
      <i className={`mdi mdi-${item.file_type === 'video' ? 'video' : 'image'} dcm-file-icon`} />
      <div className="dcm-file-info">
        <span className="dcm-file-name">{filename}</span>
        {dir && <span className="dcm-file-path">{dir}</span>}
      </div>
      <span className="dcm-file-time">{formatTime(item.timestamp)}</span>
    </div>
  )
}

export default function DeleteConfirmModal({ preview, onConfirm, onCancel, busy, error }) {
  const totalCount = preview.selected.length + preview.related_videos.length

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, busy])

  return (
    <div className="dcm-backdrop" onClick={() => { if (!busy) onCancel() }}>
      <div className="dcm-card" onClick={e => e.stopPropagation()}>

        <div className="dcm-header">
          <span className="dcm-title">
            <i className="mdi mdi-delete-alert-outline" /> Confirm deletion
            <span className="dcm-count-badge">{totalCount}</span>
          </span>
          <button className="dcm-close modal-close" onClick={onCancel} disabled={busy}>×</button>
        </div>

        <div className="dcm-body">
          <div className="dcm-section-label">
            Selected ({preview.selected.length})
          </div>
          <div className="dcm-file-list">
            {preview.selected.map(item => (
              <FileRow key={item.id} item={item} />
            ))}
          </div>

          {preview.related_videos.length > 0 && (
            <>
              <div className="dcm-section-label dcm-section-label-related">
                Auto-added related videos ({preview.related_videos.length})
              </div>
              <p className="dcm-related-note">matched within ±5 s of a selected photo</p>
              <div className="dcm-file-list">
                {preview.related_videos.map(item => (
                  <FileRow key={item.id} item={item} />
                ))}
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="dcm-error">
            <i className="mdi mdi-alert-circle-outline" /> {error}
          </div>
        )}

        <div className="dcm-footer">
          <button className="modal-btn neutral" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="modal-btn danger" onClick={onConfirm} disabled={busy}>
            {busy
              ? <><i className="mdi mdi-loading mdi-spin" /> Deleting…</>
              : <><i className="mdi mdi-delete-outline" /> Delete {totalCount} {totalCount === 1 ? 'file' : 'files'}</>
            }
          </button>
        </div>

      </div>
    </div>
  )
}
