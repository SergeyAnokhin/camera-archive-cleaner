import { useState, useEffect } from 'react'
import {
  clearDatabase, clearAllThumbnails, clearThumbnails,
  clearDiffThumbnails, clearErosionThumbnails,
  clearVideoThumbnails, clearOpenVinoThumbnails,
  vacuumDatabase, getStorageInfo, getCameraDateRange,
} from '../../../api.js'

// Maintenance section (DB + thumbnail cleanup)
function fmtBytes(b) {
  if (b == null || b === 0) return null
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function toDateInput(isoStr) {
  return isoStr ? isoStr.slice(0, 16) : ''
}

function ActionRow({ name, desc, sizeLabel, danger, onAction, busy, result, renderResult }) {
  const [confirming, setConfirming] = useState(false)

  function handleClick() {
    if (danger && !confirming) { setConfirming(true); return }
    setConfirming(false)
    onAction()
  }

  const btnClass = danger ? 'modal-btn danger-outline' : 'modal-btn neutral'
  const confirmBtnClass = danger ? 'modal-btn danger' : 'modal-btn'

  return (
    <div style={{ marginBottom: 10 }}>
      <div className="modal-action-row">
        <div className="modal-action-info">
          <span className="modal-action-name">{name}</span>
          <span className="modal-action-desc">
            {desc}
            {sizeLabel && <span className="modal-action-size"> · {sizeLabel}</span>}
          </span>
        </div>
        {confirming ? (
          <div className="modal-confirm-group">
            <span className="modal-confirm-text">Sure?</span>
            <button className={confirmBtnClass} onClick={handleClick} disabled={busy}>
              {busy ? <i className="mdi mdi-loading mdi-spin" /> : 'Yes'}
            </button>
            <button className="modal-btn neutral" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        ) : (
          <button className={btnClass} onClick={handleClick} disabled={busy}>
            {busy ? <i className="mdi mdi-loading mdi-spin" /> : <><i className="mdi mdi-delete-sweep-outline" /> Clear</>}
          </button>
        )}
      </div>
      {result && !result.ok && <div className="modal-result err">{result.text}</div>}
      {result?.ok && renderResult && <div className="modal-result ok">{renderResult(result.res)}</div>}
    </div>
  )
}

function useAsync() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  async function run(fn) {
    setBusy(true)
    setResult(null)
    let r
    try {
      const res = await fn()
      r = { ok: true, res }
      setResult(r)
    } catch (e) {
      r = { ok: false, text: e.message }
      setResult(r)
    } finally {
      setBusy(false)
    }
    return r
  }

  return { busy, result, run }
}

export default function MaintenanceSection({ onDatabaseCleared, cameraId, cameras }) {
  const [storageInfo, setStorageInfo] = useState(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [datesFilled, setDatesFilled] = useState(false)

  const camName = cameras?.find(c => c.id === cameraId)?.name ?? cameraId ?? '—'

  const allThumb    = useAsync()
  const basicThumb  = useAsync()
  const motionThumb = useAsync()
  const videoThumb  = useAsync()
  const ovThumb     = useAsync()
  const dbClear     = useAsync()
  const vacuumAct   = useAsync()

  useEffect(() => {
    getStorageInfo().then(setStorageInfo).catch(() => {})
  }, [])

  useEffect(() => {
    if (!cameraId) return
    getCameraDateRange(cameraId)
      .then(range => {
        if (range.date_from && range.date_to) {
          setDateFrom(toDateInput(range.date_from))
          setDateTo(toDateInput(range.date_to))
          setDatesFilled(true)
        }
      })
      .catch(() => {})
  }, [cameraId])

  function refreshStorage() {
    getStorageInfo().then(setStorageInfo).catch(() => {})
  }

  const df = dateFrom ? dateFrom + ':00' : null
  const dt = dateTo   ? dateTo   + ':00' : null

  async function handleClearAllThumbs() {
    await allThumb.run(() => clearAllThumbnails(cameraId, df, dt))
    refreshStorage()
  }

  async function handleClearBasic() {
    await basicThumb.run(() => clearThumbnails(cameraId, df, dt))
    refreshStorage()
  }

  async function handleClearMotion() {
    await motionThumb.run(async () => {
      const results = await Promise.all([
        clearDiffThumbnails(cameraId, df, dt),
        clearErosionThumbnails(cameraId, df, dt),
      ])
      const total = results.reduce((s, r) => s + (r.deleted_files || 0), 0)
      return { total }
    })
    refreshStorage()
  }

  async function handleClearVideo() {
    await videoThumb.run(() => clearVideoThumbnails(cameraId, df, dt))
    refreshStorage()
  }

  async function handleClearOpenVino() {
    await ovThumb.run(() => clearOpenVinoThumbnails(cameraId, df, dt))
    refreshStorage()
  }

  async function handleClearDb() {
    const r = await dbClear.run(() => clearDatabase(cameraId, df, dt))
    if (r?.ok) onDatabaseCleared()
    refreshStorage()
  }

  async function handleVacuum() {
    await vacuumAct.run(vacuumDatabase)
    refreshStorage()
  }

  const dbSizeStr    = storageInfo ? fmtBytes(storageInfo.db_size_bytes)    : null
  const thumbSizeStr = storageInfo ? fmtBytes(storageInfo.thumbnails_size_bytes) : null

  return (
    <>
      {/* Camera indicator */}
      {cameraId && (
        <div className="modal-section" style={{ paddingBottom: 6 }}>
          <div className="modal-setting-hint">
            <i className="mdi mdi-cctv" style={{ marginRight: 5 }} />
            Camera: <strong>{camName}</strong>
          </div>
        </div>
      )}

      {/* Date range filter */}
      <div className="modal-section">
        <div className="modal-section-title">Date range</div>
        <div className="modal-setting-hint" style={{ marginBottom: 8 }}>
          All clear operations are applied only to files within this range.
          {datesFilled && <span style={{ color: '#86efac', marginLeft: 6 }}>
            <i className="mdi mdi-check-circle" style={{ marginRight: 3 }} />
            auto-filled from camera
          </span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="datetime-local"
            className="modal-text-input"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setDatesFilled(false) }}
            style={{ flex: 1, minWidth: 170, colorScheme: 'dark' }}
          />
          <span style={{ color: 'var(--text-dim)', fontSize: 'calc(var(--font-base) * 0.85)' }}>→</span>
          <input
            type="datetime-local"
            className="modal-text-input"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setDatesFilled(false) }}
            style={{ flex: 1, minWidth: 170, colorScheme: 'dark' }}
          />
          <button className="modal-btn neutral" onClick={() => {
            setDateFrom(''); setDateTo(''); setDatesFilled(false)
          }}>
            <i className="mdi mdi-close" /> All dates
          </button>
        </div>
        {(df || dt) && (
          <div className="modal-setting-hint" style={{ marginTop: 6, color: '#60a5fa' }}>
            <i className="mdi mdi-filter-outline" style={{ marginRight: 4 }} />
            Filter active: {df ? df.slice(0, 16) : '…'} → {dt ? dt.slice(0, 16) : '…'}
          </div>
        )}
      </div>

      {/* Thumbnail cleanup */}
      <div className="modal-section">
        <div className="modal-section-title">Thumbnail cache</div>

        <ActionRow
          name="All thumbnails"
          desc="Basic + motion + video + detection (all types)"
          sizeLabel={thumbSizeStr}
          onAction={handleClearAllThumbs}
          busy={allThumb.busy}
          result={allThumb.result}
          renderResult={res => {
            const t = res?.types
            if (!t) return 'Cleared'
            const parts = Object.entries(t)
              .filter(([, v]) => v.deleted_files > 0)
              .map(([k, v]) => `${k}: ${v.deleted_files}`)
            return `Deleted ${res.total_files} file(s)${parts.length ? ` (${parts.join(', ')})` : ''}`
          }}
        />

        <ActionRow
          name="Basic thumbnails"
          desc="256×256 thumbnails for Normal mode"
          onAction={handleClearBasic}
          busy={basicThumb.busy}
          result={basicThumb.result}
          renderResult={res => `Deleted ${res?.deleted_files ?? 0} file(s)`}
        />

        <ActionRow
          name="Motion thumbnails"
          desc="Motion highlight, Motion noise-filtered — motion analysis modes"
          onAction={handleClearMotion}
          busy={motionThumb.busy}
          result={motionThumb.result}
          renderResult={res => `Deleted ${res?.total ?? 0} file(s)`}
        />

        <ActionRow
          name="Object detection (local)"
          desc="object_detection DB records for the selected range. Disk cache with bounding boxes is cleared on full clear."
          onAction={handleClearOpenVino}
          busy={ovThumb.busy}
          result={ovThumb.result}
          renderResult={res => {
            const parts = []
            if (res?.deleted_files) parts.push(`${res.deleted_files} file(s)`)
            if (res?.deleted_rows)  parts.push(`${res.deleted_rows} DB rows`)
            return `Deleted: ${parts.join(', ') || '0'}`
          }}
        />

        <ActionRow
          name="Video thumbnails"
          desc="Preview cache for video files (first frame, grid, GIF) + DB records"
          onAction={handleClearVideo}
          busy={videoThumb.busy}
          result={videoThumb.result}
          renderResult={res => `Deleted ${res?.deleted_files ?? 0} file(s)`}
        />
      </div>

      {/* Database */}
      <div className="modal-section">
        <div className="modal-section-title">Database</div>

        <ActionRow
          danger
          name="Clear file records"
          desc={`Delete records${cameraId ? ` for camera "${camName}"` : ''} from the DB for the selected range (files on disk are not touched)`}
          sizeLabel={dbSizeStr}
          onAction={handleClearDb}
          busy={dbClear.busy}
          result={dbClear.result}
          renderResult={() => 'Records cleared.'}
        />

        <div className="modal-action-row" style={{ marginTop: 4 }}>
          <div className="modal-action-info">
            <span className="modal-action-name">Optimize database</span>
            <span className="modal-action-desc">
              VACUUM — shrink the DB file size after deleting records
              {dbSizeStr && <span className="modal-action-size"> · {dbSizeStr}</span>}
            </span>
          </div>
          <button className="modal-btn neutral" onClick={handleVacuum} disabled={vacuumAct.busy}>
            {vacuumAct.busy
              ? <i className="mdi mdi-loading mdi-spin" />
              : <><i className="mdi mdi-database-cog-outline" /> Vacuum</>
            }
          </button>
        </div>
        {vacuumAct.result && !vacuumAct.result.ok && (
          <div className="modal-result err">{vacuumAct.result.text}</div>
        )}
        {vacuumAct.result?.ok && (
          <div className="modal-result ok">Database optimized.</div>
        )}
      </div>
    </>
  )
}
