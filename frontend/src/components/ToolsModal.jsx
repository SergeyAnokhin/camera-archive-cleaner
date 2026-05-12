import { useState, useEffect } from 'react'
import { clearDatabase, clearThumbnails } from '../api.js'
import './ToolsModal.css'

const FONT_KEY = 'font-base'
const FONT_MIN = 12
const FONT_MAX = 22
const FONT_DEFAULT = 15

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
      setThumbResult({ ok: true, text: res.message ?? `Deleted ${res.deleted}.` })
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
