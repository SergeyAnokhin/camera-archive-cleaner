import { useEffect, useRef, useState } from 'react'
import { getTaskLogs } from '../api.js'
import './TaskLogsModal.css'

const ACTIVE_STATUSES = new Set(['queued', 'running', 'pausing'])

export default function TaskLogsModal({ task, onClose }) {
  const [lines, setLines]       = useState([])
  const [status, setStatus]     = useState(task.status)
  const [maximized, setMaximized] = useState(false)
  const bottomRef = useRef(null)
  const pollRef   = useRef(null)

  const isActive = ACTIVE_STATUSES.has(status)
  const params   = task.params || {}
  const isDryRun = params.dry_run

  async function fetchLogs() {
    try {
      const data = await getTaskLogs(task.id)
      setLines(data.lines || [])
      setStatus(data.status)
    } catch {}
  }

  useEffect(() => {
    fetchLogs()
    pollRef.current = setInterval(fetchLogs, 2000)
    return () => clearInterval(pollRef.current)
  }, [task.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines.length])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const label = params.label || task.type

  return (
    <div className={`tlm-backdrop${maximized ? ' tlm-backdrop--max' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`tlm-card${maximized ? ' tlm-card--max' : ''}`}>

        <div className="tlm-header">
          <div className="tlm-header-left">
            <i className="mdi mdi-console-line tlm-icon" />
            <span className="tlm-title">{label}</span>
            {isDryRun && <span className="tlm-badge tlm-badge--dry">DRY RUN</span>}
            {isActive && (
              <span className="tlm-badge tlm-badge--live">
                <i className="mdi mdi-loading mdi-spin" /> live
              </span>
            )}
          </div>
          <div className="tlm-header-actions">
            <button className="tlm-close" onClick={() => setMaximized(m => !m)} title={maximized ? 'Восстановить' : 'Развернуть'}>
              <i className={`mdi ${maximized ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'}`} />
            </button>
            <button className="tlm-close" onClick={onClose}>
              <i className="mdi mdi-close" />
            </button>
          </div>
        </div>

        <div className="tlm-log">
          {lines.length === 0 ? (
            <div className="tlm-empty">
              {isActive ? 'Ожидание первых записей…' : 'Лог пуст'}
            </div>
          ) : (
            lines.map((line, i) => (
              <div key={i} className={`tlm-line${line.includes('[DRY]') ? ' tlm-line--dry' : line.includes('ERROR') ? ' tlm-line--error' : line.includes('Skip') ? ' tlm-line--skip' : ''}`}>
                {line}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <div className="tlm-footer">
          <span className="tlm-count">{lines.length} записей</span>
          <button className="modal-btn neutral" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  )
}
