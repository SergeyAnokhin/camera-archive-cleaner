import { useState, useEffect } from 'react'
import './ToolsModal.css'
import GeneralTab from './tools/GeneralTab.jsx'
import HourViewTab from './tools/HourViewTab.jsx'
import DetectionTab from './tools/DetectionTab.jsx'
import GoogleAiTab from './tools/GoogleAiTab.jsx'
import ClaudeAiTab from './tools/ClaudeAiTab.jsx'
import OllamaAiTab from './tools/OllamaAiTab.jsx'
import ComputeTab from './tools/ComputeTab.jsx'
import MaintenanceTab from './tools/MaintenanceTab.jsx'

const TABS = [
  { id: 'general',     label: 'General' },
  { id: 'hour_view',   label: 'Hour view' },
  { id: 'detection',   label: 'Detection' },
  { id: 'google_ai',   label: 'Google AI' },
  { id: 'claude_ai',   label: 'Claude AI' },
  { id: 'ollama_ai',   label: 'Ollama' },
  { id: 'compute',     label: 'Compute' },
  { id: 'maintenance', label: 'Maintenance' },
]

export default function ToolsModal({ onClose, onDatabaseCleared }) {
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
          {activeTab === 'hour_view'   && <HourViewTab />}
          {activeTab === 'detection'   && <DetectionTab />}
          {activeTab === 'google_ai'   && <GoogleAiTab />}
          {activeTab === 'claude_ai'   && <ClaudeAiTab />}
          {activeTab === 'ollama_ai'   && <OllamaAiTab />}
          {activeTab === 'compute'     && <ComputeTab />}
          {activeTab === 'maintenance' && <MaintenanceTab onDatabaseCleared={onDatabaseCleared} />}
        </div>
      </div>
    </div>
  )
}
