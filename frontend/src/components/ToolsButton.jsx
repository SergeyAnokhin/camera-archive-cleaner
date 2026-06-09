import { useState } from 'react'
import ToolsModal from './ToolsModal.jsx'
import './ToolsButton.css'

export default function ToolsButton({ onDatabaseCleared, cameraId, cameras }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button className="tools-button" onClick={() => setOpen(true)}>
        <i className="mdi mdi-wrench-outline" />
        Tools
      </button>
      {open && (
        <ToolsModal
          onClose={() => setOpen(false)}
          onDatabaseCleared={() => { setOpen(false); onDatabaseCleared() }}
          cameraId={cameraId}
          cameras={cameras}
        />
      )}
    </>
  )
}
