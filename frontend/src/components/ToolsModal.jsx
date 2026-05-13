import { useState, useEffect } from 'react'
import { clearDatabase, clearAllThumbnails, getStorageInfo } from '../api.js'
import './ToolsModal.css'

const FONT_KEY = 'font-base'
const FONT_MIN = 12
const FONT_MAX = 22
const FONT_DEFAULT = 15

const PREVIEWS_PER_CELL_KEY = 'previews_per_cell'
const PREVIEWS_PER_CELL_MIN = 0
const PREVIEWS_PER_CELL_MAX = 10
const PREVIEWS_PER_CELL_DEFAULT = 3

const PAGE_SIZE_KEY = 'hour_page_size'
const PAGE_SIZE_MIN = 10
const PAGE_SIZE_MAX = 200
const PAGE_SIZE_DEFAULT = 50

const ZOOM_KEY = 'hover_zoom'
const ZOOM_MIN = 1.0
const ZOOM_MAX = 3.0
const ZOOM_STEP = 0.25
const ZOOM_DEFAULT = 1.5

const THUMB_WIDTH_KEY     = 'thumb_width'
const THUMB_WIDTH_MIN     = 80
const THUMB_WIDTH_MAX     = 400
const THUMB_WIDTH_DEFAULT = 140

const DIFF_THRESHOLD_KEY     = 'diff_threshold'
const DIFF_THRESHOLD_MIN     = 0
const DIFF_THRESHOLD_MAX     = 100
const DIFF_THRESHOLD_DEFAULT = 20

function fmtBytes(b) {
  if (b == null) return null
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function applyFontSize(px) {
  document.documentElement.style.setProperty('--font-base', px + 'px')
}

export function initFontSize() {
  const saved = localStorage.getItem(FONT_KEY)
  if (saved) applyFontSize(Number(saved))
}

export default function ToolsModal({ onClose, onDatabaseCleared }) {
  const [fontSize, setFontSize] = useState(() => {
    return Number(localStorage.getItem(FONT_KEY)) || FONT_DEFAULT
  })
  const [previewsPerCell, setPreviewsPerCell] = useState(() => {
    const v = localStorage.getItem(PREVIEWS_PER_CELL_KEY)
    return v !== null ? Number(v) : PREVIEWS_PER_CELL_DEFAULT
  })
  const [pageSize, setPageSize] = useState(() => {
    return Number(localStorage.getItem(PAGE_SIZE_KEY)) || PAGE_SIZE_DEFAULT
  })
  const [hoverZoom, setHoverZoom] = useState(() => {
    return Number(localStorage.getItem(ZOOM_KEY)) || ZOOM_DEFAULT
  })
  const [thumbWidth, setThumbWidth] = useState(() => {
    return Number(localStorage.getItem(THUMB_WIDTH_KEY)) || THUMB_WIDTH_DEFAULT
  })
  const [diffThreshold, setDiffThreshold] = useState(() => {
    const v = localStorage.getItem(DIFF_THRESHOLD_KEY)
    return v !== null ? Number(v) : DIFF_THRESHOLD_DEFAULT
  })
  const [dbConfirm, setDbConfirm] = useState(false)
  const [dbBusy, setDbBusy]       = useState(false)
  const [dbResult, setDbResult]   = useState(null)
  const [thumbBusy, setThumbBusy]     = useState(false)
  const [thumbResult, setThumbResult] = useState(null)
  const [storageInfo, setStorageInfo] = useState(null)

  function handleFontChange(e) {
    const px = Number(e.target.value)
    setFontSize(px)
    applyFontSize(px)
    localStorage.setItem(FONT_KEY, px)
    document.dispatchEvent(new CustomEvent('font-base-change', { detail: px }))
  }

  function handlePreviewsPerCellChange(e) {
    const v = Number(e.target.value)
    setPreviewsPerCell(v)
    localStorage.setItem(PREVIEWS_PER_CELL_KEY, v)
    document.dispatchEvent(new CustomEvent('previews-per-cell-change', { detail: v }))
  }

  function handlePageSizeChange(e) {
    const raw = Number(e.target.value)
    const v = Math.max(PAGE_SIZE_MIN, Math.min(PAGE_SIZE_MAX, raw || PAGE_SIZE_DEFAULT))
    setPageSize(v)
    localStorage.setItem(PAGE_SIZE_KEY, v)
    document.dispatchEvent(new CustomEvent('hour-page-size-change', { detail: v }))
  }

  function handleHoverZoomChange(e) {
    const v = Number(e.target.value)
    setHoverZoom(v)
    localStorage.setItem(ZOOM_KEY, v)
    document.dispatchEvent(new CustomEvent('hover-zoom-change', { detail: v }))
  }

  function handleThumbWidthChange(e) {
    const v = Number(e.target.value)
    setThumbWidth(v)
    localStorage.setItem(THUMB_WIDTH_KEY, v)
    document.dispatchEvent(new CustomEvent('thumb-width-change', { detail: v }))
  }

  function handleDiffThresholdChange(e) {
    const v = Number(e.target.value)
    setDiffThreshold(v)
    localStorage.setItem(DIFF_THRESHOLD_KEY, v)
    document.dispatchEvent(new CustomEvent('diff-threshold-change', { detail: v }))
  }

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

  const [activeTab, setActiveTab] = useState('general')

  useEffect(() => {
    if (activeTab !== 'maintenance') return
    getStorageInfo().then(setStorageInfo).catch(() => {})
  }, [activeTab])

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const TABS = [
    { id: 'general',     label: 'General' },
    { id: 'hour_view',   label: 'Hour view' },
    { id: 'maintenance', label: 'Maintenance' },
  ]

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-card">
        <div className="modal-header">
          <span><i className="mdi mdi-wrench-outline" /> Tools</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`modal-tab${activeTab === t.id ? ' active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="modal-tab-content">

          {activeTab === 'general' && <>
            {/* Font size */}
            <div className="modal-section">
              <div className="modal-section-title">Font size</div>
              <div className="font-slider-row">
                <span className="font-size-label">A</span>
                <input type="range" min={FONT_MIN} max={FONT_MAX} step="1"
                  value={fontSize} onChange={handleFontChange} className="font-slider" />
                <span className="font-size-label large">A</span>
                <span className="font-size-value">{fontSize} px</span>
              </div>
            </div>

            {/* Previews per cell */}
            <div className="modal-section">
              <div className="modal-section-title">Preview thumbnails per cell</div>
              <div className="font-slider-row">
                <span className="font-size-label">0</span>
                <input type="range" min={PREVIEWS_PER_CELL_MIN} max={PREVIEWS_PER_CELL_MAX} step="1"
                  value={previewsPerCell} onChange={handlePreviewsPerCellChange} className="font-slider" />
                <span className="font-size-label">{PREVIEWS_PER_CELL_MAX}</span>
                <span className="font-size-value">{previewsPerCell}</span>
              </div>
              <div className="modal-setting-hint">Thumbnails shown inside each heatmap cell (year/month/day). Set 0 to disable.</div>
            </div>
          </>}

          {activeTab === 'hour_view' && <>
            {/* Photos per page */}
            <div className="modal-section">
              <div className="modal-section-title">Photos per page</div>
              <div className="font-slider-row">
                <input type="number" min={PAGE_SIZE_MIN} max={PAGE_SIZE_MAX} step="10"
                  value={pageSize} onChange={handlePageSizeChange} className="modal-number-input" />
                <span className="font-size-value" style={{ marginLeft: 0 }}>per page</span>
              </div>
              <div className="modal-setting-hint">Number of items per page when browsing a specific hour ({PAGE_SIZE_MIN}–{PAGE_SIZE_MAX}).</div>
            </div>

            {/* Thumbnail width */}
            <div className="modal-section">
              <div className="modal-section-title">Thumbnail width</div>
              <div className="font-slider-row">
                <span className="font-size-label">{THUMB_WIDTH_MIN}</span>
                <input type="range" min={THUMB_WIDTH_MIN} max={THUMB_WIDTH_MAX} step="10"
                  value={thumbWidth} onChange={handleThumbWidthChange} className="font-slider" />
                <span className="font-size-label">{THUMB_WIDTH_MAX}</span>
                <span className="font-size-value">{thumbWidth} px</span>
              </div>
              <div className="modal-setting-hint">Minimum column width of photo cards.</div>
            </div>

            {/* Hover zoom */}
            <div className="modal-section">
              <div className="modal-section-title">Hover zoom</div>
              <div className="font-slider-row">
                <span className="font-size-label">1×</span>
                <input type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP}
                  value={hoverZoom} onChange={handleHoverZoomChange} className="font-slider" />
                <span className="font-size-label">{ZOOM_MAX}×</span>
                <span className="font-size-value">{hoverZoom.toFixed(2)}×</span>
              </div>
              <div className="modal-setting-hint">Scale factor when hovering a photo. Set to 1× to disable.</div>
            </div>

            {/* Motion diff threshold */}
            <div className="modal-section">
              <div className="modal-section-title">Motion diff — change threshold</div>
              <div className="font-slider-row">
                <span className="font-size-label">{DIFF_THRESHOLD_MIN}</span>
                <input type="range" min={DIFF_THRESHOLD_MIN} max={DIFF_THRESHOLD_MAX} step="1"
                  value={diffThreshold} onChange={handleDiffThresholdChange} className="font-slider" />
                <span className="font-size-label">{DIFF_THRESHOLD_MAX}</span>
                <span className="font-size-value">{diffThreshold}</span>
              </div>
              <div className="modal-setting-hint">Pixels with a channel delta below this value are darkened in Motion diff mode. Higher = only significant changes shown.</div>
            </div>
          </>}

          {activeTab === 'maintenance' && <>
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
          </>}

        </div>
      </div>
    </div>
  )
}
