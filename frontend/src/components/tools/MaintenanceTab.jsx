import { useState, useEffect } from 'react'
import { clearDatabase, clearAllThumbnails, getStorageInfo } from '../../api.js'

function fmtBytes(b) {
  if (b == null) return null
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function MaintenanceTab({ onDatabaseCleared }) {
  const [dbConfirm, setDbConfirm] = useState(false)
  const [dbBusy, setDbBusy]       = useState(false)
  const [dbResult, setDbResult]   = useState(null)
  const [thumbBusy, setThumbBusy]     = useState(false)
  const [thumbResult, setThumbResult] = useState(null)
  const [storageInfo, setStorageInfo] = useState(null)

  useEffect(() => {
    getStorageInfo().then(setStorageInfo).catch(() => {})
  }, [])

  async function handleClearDb() {
    if (!dbConfirm) { setDbConfirm(true); return }
    setDbBusy(true)
    setDbResult(null)
    try {
      await clearDatabase()
      setDbResult({ ok: true, text: 'Database cleared.' })
      onDatabaseCleared()
    } catch (e) {
      setDbResult({ ok: false, text: e.message })
    } finally {
      setDbBusy(false)
      setDbConfirm(false)
    }
  }

  async function handleClearThumbnails() {
    setThumbBusy(true)
    setThumbResult(null)
    try {
      const res = await clearAllThumbnails()
      setThumbResult({ ok: true, res })
      setStorageInfo(si => si ? { ...si, thumbnails_size_bytes: 0 } : si)
    } catch (e) {
      setThumbResult({ ok: false, text: e.message })
    } finally {
      setThumbBusy(false)
    }
  }

  return (
    <>
      {/* Clear database */}
      <div className="modal-section">
        <div className="modal-section-title">Danger zone</div>
        <div className="modal-action-row">
          <div className="modal-action-info">
            <span className="modal-action-name">Clear database</span>
            <span className="modal-action-desc">
              Remove all scanned file records
              {storageInfo && fmtBytes(storageInfo.db_size_bytes) &&
                <span className="modal-action-size"> · {fmtBytes(storageInfo.db_size_bytes)}</span>
              }
            </span>
          </div>
          {dbConfirm ? (
            <div className="modal-confirm-group">
              <span className="modal-confirm-text">Sure?</span>
              <button className="modal-btn danger" onClick={handleClearDb} disabled={dbBusy}>
                {dbBusy ? <i className="mdi mdi-loading mdi-spin" /> : 'Yes, clear'}
              </button>
              <button className="modal-btn neutral" onClick={() => setDbConfirm(false)}>Cancel</button>
            </div>
          ) : (
            <button className="modal-btn danger-outline" onClick={handleClearDb}>
              <i className="mdi mdi-database-remove-outline" /> Clear
            </button>
          )}
        </div>
        {dbResult && (
          <div className={`modal-result ${dbResult.ok ? 'ok' : 'err'}`}>{dbResult.text}</div>
        )}
      </div>

      {/* Clear all thumbnails */}
      <div className="modal-section">
        <div className="modal-action-row">
          <div className="modal-action-info">
            <span className="modal-action-name">Clear all thumbnails</span>
            <span className="modal-action-desc">
              Delete cached previews of all types (basic, diff, erosion, motion)
              {storageInfo && storageInfo.thumbnails_size_bytes > 0 &&
                <span className="modal-action-size"> · {fmtBytes(storageInfo.thumbnails_size_bytes)}</span>
              }
            </span>
          </div>
          <button className="modal-btn danger-outline" onClick={handleClearThumbnails} disabled={thumbBusy}>
            {thumbBusy
              ? <i className="mdi mdi-loading mdi-spin" />
              : <><i className="mdi mdi-image-remove-outline" /> Clear</>
            }
          </button>
        </div>
        {thumbResult && !thumbResult.ok && (
          <div className="modal-result err">{thumbResult.text}</div>
        )}
        {thumbResult?.ok && thumbResult.res && (() => {
          const t = thumbResult.res.types
          const total = thumbResult.res.total_files
          const freed = thumbResult.res.freed_bytes
          const parts = [
            t.basic.deleted_files    && `basic: ${t.basic.deleted_files}`,
            t.diff.deleted_files     && `diff: ${t.diff.deleted_files}`,
            t.diff_zoom.deleted_files && `diff-zoom: ${t.diff_zoom.deleted_files}`,
            t.erosion.deleted_files  && `erosion: ${t.erosion.deleted_files}`,
            t.motion.deleted_files   && `motion: ${t.motion.deleted_files}`,
          ].filter(Boolean)
          return (
            <div className="modal-result ok">
              Deleted {total} {total === 1 ? 'file' : 'files'}
              {parts.length > 0 && ` (${parts.join(', ')})`}
              {freed > 0 && ` · freed ${fmtBytes(freed)}`}
            </div>
          )
        })()}
      </div>
    </>
  )
}
