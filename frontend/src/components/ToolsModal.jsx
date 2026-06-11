import { useState, useEffect } from 'react'
import './ToolsModal.css'
import GeneralTab from './tools/GeneralTab.jsx'
import HourViewTab from './tools/HourViewTab.jsx'
import DetectionTab from './tools/DetectionTab.jsx'
import AiTab from './tools/AiTab.jsx'
import TasksTab from './tools/TasksTab.jsx'
import ComputeTab from './tools/ComputeTab.jsx'
import MaintenanceTab from './tools/MaintenanceTab.jsx'
import LoggingTab from './tools/LoggingTab.jsx'

const TABS = [
  { id: 'general',     label: 'General' },
  { id: 'view',        label: 'View' },
  { id: 'detection',   label: 'Detection' },
  { id: 'ai',          label: 'AI' },
  { id: 'tasks',       label: 'Tasks' },
  { id: 'compute',     label: 'Compute' },
  { id: 'logging',     label: 'Logging' },
  { id: 'maintenance', label: 'Maintenance' },
]

export default function ToolsModal({ onClose, onDatabaseCleared, cameraId, cameras }) {
  const [activeTab, setActiveTab] = useState('general')

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
          {activeTab === 'general'     && <GeneralTab />}
          {activeTab === 'view'        && <HourViewTab />}
          {activeTab === 'detection'   && <DetectionTab />}
          {activeTab === 'ai'          && <AiTab />}
          {activeTab === 'tasks'       && <TasksTab />}
          {activeTab === 'compute'     && <ComputeTab />}
          {activeTab === 'logging'     && <LoggingTab />}
          {activeTab === 'maintenance' && (
            <MaintenanceTab
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
