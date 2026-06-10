import { useEffect } from 'react'
import './DeleteConfirmModal.css'

function cameraRoot(camera) {
  const p = (camera?.path || '').replace(/\\/g, '/')
  return p ? p.replace(/\/?$/, '/') : ''
}

function FileRow({ item, root }) {
  const fp = (item.file_path || '').replace(/\\/g, '/')
  const rel = root && fp.startsWith(root) ? fp.slice(root.length) : fp
  return <div className="dcm-file-row">{rel}</div>
}

export default function DeleteConfirmModal({ preview, onConfirm, onCancel, busy, error, camera }) {
  const totalCount = preview.selected.length + preview.related_videos.length
  const root = cameraRoot(camera)

  useEffect(() => {
    function onKey(e) {
      if ((e.key === 'Escape' || e.key === 'Backspace') && !busy) {
        e.stopImmediatePropagation()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
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
          <div className="dcm-section-label">Selected ({preview.selected.length})</div>
          <div className="dcm-file-list">
            {preview.selected.map(item => (
              <FileRow key={item.id} item={item} root={root} />
            ))}
          </div>

          {preview.related_videos.length > 0 && (
            <>
              <div className="dcm-section-label dcm-section-label-related">
                Auto-added related videos ({preview.related_videos.length})
                <span className="dcm-related-note"> — matched within ±5 s of a selected photo</span>
              </div>
              <div className="dcm-file-list">
                {preview.related_videos.map(item => (
                  <FileRow key={item.id} item={item} root={root} />
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
          <button className="modal-btn danger" onClick={onConfirm} disabled={busy} autoFocus>
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
