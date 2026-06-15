import { useState, useEffect } from 'react'
import ToolsModal from './ToolsModal.jsx'
import './ToolsButton.css'

export default function ToolsButton({ onDatabaseCleared, onCamerasChanged, cameraId, cameras, onboardingDone }) {
  const [open, setOpen] = useState(false)
  const [initialTab, setInitialTab] = useState(null)

  // Deep link: any component can dispatch `open-tools` with { detail: { tab } }
  useEffect(() => {
    function onOpenTools(e) {
      setInitialTab(e.detail?.tab ?? null)
      setOpen(true)
    }
    window.addEventListener('open-tools', onOpenTools)
    return () => window.removeEventListener('open-tools', onOpenTools)
  }, [])

  return (
    <>
      <button
        className={`tools-button${!onboardingDone ? ' setup-pulse' : ''}`}
        onClick={() => { setInitialTab(null); setOpen(true) }}
      >
        <i className="mdi mdi-wrench-outline" />
        <span className="btn-label">Tools</span>
      </button>
      {open && (
        <ToolsModal
          initialTab={initialTab}
          onboardingDone={onboardingDone}
          onClose={() => setOpen(false)}
          onDatabaseCleared={() => { setOpen(false); onDatabaseCleared() }}
          onCamerasChanged={onCamerasChanged}
          cameraId={cameraId}
          cameras={cameras}
        />
      )}
    </>
  )
}
