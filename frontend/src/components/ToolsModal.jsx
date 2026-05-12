import { useState, useEffect } from 'react'
import { clearDatabase, clearThumbnails } from '../api.js'
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
  const [dbConfirm, setDbConfirm]     = useState(false)
  const [dbBusy, setDbBusy]           = useState(false)
  const [dbResult, setDbResult]       = useState(null)
  const [thumbBusy, setThumbBusy]     = useState(false)
  const [thumbResult, setThumbResult] = useState(null)

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
      const res = await clearThumbnails()
      setThumbResult({ ok: true, text: `Deleted ${res.deleted_files ?? 0} files.` })
    } catch (e) {
      setThumbResult({ ok: false, text: e.message })
    } finally {
      setThumbBusy(false)
    }
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-card">
        <div className="modal-header">
          <span><i className="mdi mdi-wrench-outline" /> Tools</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Font size */}
        <div className="modal-section">
          <div className="modal-section-title">Font size</div>
          <div className="font-slider-row">
            <span className="font-size-label">A</span>
            <input
              type="range"
              min={FONT_MIN}
              max={FONT_MAX}
              step="1"
              value={fontSize}
              onChange={handleFontChange}
              className="font-slider"
            />
            <span className="font-size-label large">A</span>
            <span className="font-size-value">{fontSize} px</span>
          </div>
        </div>

        {/* Previews per cell */}
        <div className="modal-section">
          <div className="modal-section-title">Preview thumbnails per cell</div>
          <div className="font-slider-row">
            <span className="font-size-label">0</span>
            <input
              type="range"
              min={PREVIEWS_PER_CELL_MIN}
              max={PREVIEWS_PER_CELL_MAX}
              step="1"
              value={previewsPerCell}
              onChange={handlePreviewsPerCellChange}
              className="font-slider"
            />
            <span className="font-size-label">{PREVIEWS_PER_CELL_MAX}</span>
            <span className="font-size-value">{previewsPerCell}</span>
          </div>
          <div className="modal-setting-hint">Thumbnails shown inside each heatmap cell (year/month/day). Set 0 to disable.</div>
        </div>

        {/* Hour view page size */}
        <div className="modal-section">
          <div className="modal-section-title">Hour view — photos per page</div>
          <div className="font-slider-row">
            <input
              type="number"
              min={PAGE_SIZE_MIN}
              max={PAGE_SIZE_MAX}
              step="10"
              value={pageSize}
              onChange={handlePageSizeChange}
              className="modal-number-input"
            />
            <span className="font-size-value" style={{ marginLeft: 0 }}>per page</span>
          </div>
          <div className="modal-setting-hint">Number of items per page when browsing a specific hour ({PAGE_SIZE_MIN}–{PAGE_SIZE_MAX}).</div>
        </div>

        {/* Clear database */}
        <div className="modal-section">
          <div className="modal-section-title">Danger zone</div>
          <div className="modal-action-row">
            <div className="modal-action-info">
              <span className="modal-action-name">Clear database</span>
              <span className="modal-action-desc">Remove all scanned file records</span>
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

        {/* Clear thumbnails */}
        <div className="modal-section">
          <div className="modal-action-row">
            <div className="modal-action-info">
              <span className="modal-action-name">Clear thumbnails</span>
              <span className="modal-action-desc">Delete all cached preview images</span>
            </div>
            <button className="modal-btn danger-outline" onClick={handleClearThumbnails} disabled={thumbBusy}>
              {thumbBusy
                ? <i className="mdi mdi-loading mdi-spin" />
                : <><i className="mdi mdi-image-remove-outline" /> Clear</>
              }
            </button>
          </div>
          {thumbResult && (
            <div className={`modal-result ${thumbResult.ok ? 'ok' : 'err'}`}>{thumbResult.text}</div>
          )}
        </div>
      </div>
    </div>
  )
}
