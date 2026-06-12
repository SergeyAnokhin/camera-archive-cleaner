import { useEffect } from 'react'
import './DeleteConfirmModal.css'

function cameraRoot(camera) {
  const p = (camera?.path || '').replace(/\\/g, '/')
  return p ? p.replace(/\/?$/, '/') : ''
}

// file_path may have been indexed under a different CAMERA_ROOT than the one
// the backend currently reports in camera.path, so a prefix match can fail.
// Fall back to locating the camera's folder name anywhere in the path.
function toRelative(fp, root) {
  if (!root) return fp
  const idx = fp.indexOf(root)
  if (idx >= 0) return fp.slice(idx + root.length)
  const seg = root.split('/').filter(Boolean).pop()
  if (seg) {
    const i = fp.indexOf('/' + seg + '/')
    if (i >= 0) return fp.slice(i + seg.length + 2)
  }
  return fp
}

function FileRow({ item, root }) {
  const fp = (item.file_path || '').replace(/\\/g, '/')
  return <div className="dcm-file-row">{toRelative(fp, root)}</div>
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
