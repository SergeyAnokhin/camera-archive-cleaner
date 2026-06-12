import { useState } from 'react'
import { triggerScan } from '../api.js'
import './ScanButton.css'

export default function ScanButton({ cameraId, onScanComplete }) {
  const [scanning, setScanning] = useState(false)

  async function handleScan() {
    setScanning(true)
    try {
      await triggerScan(cameraId)
      onScanComplete()
    } finally {
      setScanning(false)
    }
  }

  return (
    <button className="scan-button" onClick={handleScan} disabled={scanning}>
      <i className={`mdi ${scanning ? 'mdi-loading mdi-spin' : 'mdi-database-refresh'}`} />
      <span className="btn-label">{scanning ? 'Scanning…' : 'Scan'}</span>
    </button>
  )
}
