import { useState, useEffect } from 'react'
import './ToolsModal.css'
import GeneralTab from './tools/GeneralTab.jsx'
import HourViewTab from './tools/HourViewTab.jsx'
import AiTab from './tools/AiTab.jsx'
import ComputeTab from './tools/ComputeTab.jsx'
import ServiceTab from './tools/ServiceTab.jsx'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'view',    label: 'View' },
  { id: 'ai',      label: 'AI' },
  { id: 'compute', label: 'Compute' },
  { id: 'service', label: 'Service' },
]

// Legacy tab IDs that map to new ones (for open-tools deep links)
const TAB_ALIASES = { detection: 'ai', tasks: 'service', logging: 'service', maintenance: 'service' }

function resolveTab(id) {
  if (TABS.some(t => t.id === id)) return id
  return TAB_ALIASES[id] || 'general'
}

export default function ToolsModal({ initialTab, onClose, onDatabaseCleared, cameraId, cameras }) {
  const [activeTab, setActiveTab] = useState(() => resolveTab(initialTab))

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
          {activeTab === 'general' && <GeneralTab />}
          {activeTab === 'view'    && <HourViewTab />}
          {activeTab === 'ai'      && <AiTab />}
          {activeTab === 'compute' && <ComputeTab />}
          {activeTab === 'service' && (
            <ServiceTab
              onDatabaseCleared={onDatabaseCleared}
              cameraId={cameraId}
              cameras={cameras}
            />
          )}
        </div>
      </div>
    </div>
  )
}
