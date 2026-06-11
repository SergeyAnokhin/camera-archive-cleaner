import { useState, useEffect } from 'react'
import { getCamerasConfig, saveCamerasConfig, checkCameraPath } from '../../api.js'

export default function CamerasTab({ onSaveSuccess }) {
  const [cameras, setCameras] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [checkResults, setCheckResults] = useState({}) // { index: { loading: bool, exists: bool, error: str, absolute_path: str } }
  const [status, setStatus] = useState(null) // { type: 'success' | 'error', text: str }

  useEffect(() => {
    setLoading(true)
    getCamerasConfig()
      .then(setCameras)
      .catch(err => setStatus({ type: 'error', text: `Failed to load cameras: ${err.message}` }))
      .finally(() => setLoading(false))
  }, [])

  function handleChange(index, field, value) {
    const updated = [...cameras]
    updated[index] = { ...updated[index], [field]: value }
    setCameras(updated)
    
    // Clear path check results for this index if path changed
    if (field === 'path') {
      setCheckResults(prev => {
        const next = { ...prev }
        delete next[index]
        return next
      })
    }
  }

  function handleAdd() {
    setCameras([...cameras, { id: '', name: '', path: '' }])
  }

  function handleDelete(index) {
    const updated = cameras.filter((_, i) => i !== index)
    setCameras(updated)
    setCheckResults(prev => {
      const next = {}
      Object.keys(prev).forEach(k => {
        const idx = Number(k)
        if (idx < index) next[idx] = prev[idx]
        if (idx > index) next[idx - 1] = prev[idx]
      })
      return next
    })
  }

  async function handleCheck(index) {
    const path = cameras[index]?.path?.trim()
    if (!path) {
      setCheckResults(prev => ({
        ...prev,
        [index]: { loading: false, exists: false, error: 'Path is empty' }
      }))
      return
    }

    setCheckResults(prev => ({
      ...prev,
      [index]: { loading: true, exists: false, error: null }
    }))

    try {
      const res = await checkCameraPath(path)
      setCheckResults(prev => ({
        ...prev,
        [index]: {
          loading: false,
          exists: res.exists,
          absolute_path: res.absolute_path,
          error: res.exists ? null : 'Directory not found on server'
        }
      }))
    } catch (err) {
      setCheckResults(prev => ({
        ...prev,
        [index]: { loading: false, exists: false, error: err.message }
      }))
    }
  }

  async function handleSave() {
    setStatus(null)
    
    // Validation
    const seenIds = new Set()
    for (let i = 0; i < cameras.length; i++) {
      const c = cameras[i]
      const id = c.id.trim()
      const name = c.name.trim()
      const path = c.path.trim()

      if (!id || !name || !path) {
        setStatus({ type: 'error', text: `Row ${i + 1}: All fields (ID, Name, Path) are required.` })
        return
      }

      if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        setStatus({ type: 'error', text: `Row ${i + 1}: ID can only contain letters, numbers, underscores, and hyphens.` })
        return
      }

      if (seenIds.has(id)) {
        setStatus({ type: 'error', text: `Duplicate Camera ID: "${id}". IDs must be unique.` })
        return
      }
      seenIds.add(id)
    }

    setSaving(true)
    try {
      await saveCamerasConfig(cameras.map(c => ({
        id: c.id.trim(),
        name: c.name.trim(),
        path: c.path.trim(),
      })))
      setStatus({ type: 'success', text: 'Cameras configuration saved successfully.' })
      if (onSaveSuccess) onSaveSuccess()
    } catch (err) {
      setStatus({ type: 'error', text: `Failed to save configuration: ${err.message}` })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 180, color: 'var(--text-dim)' }}>
        <i className="mdi mdi-loading mdi-spin" style={{ fontSize: 24, marginRight: 8 }} />
        Loading cameras config...
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-md)' }}>
      <div className="modal-setting-hint" style={{ marginBottom: 4 }}>
        <i className="mdi mdi-information-outline" style={{ marginRight: 4 }} />
        Configure your surveillance cameras here. Paths are relative to the server's <code>CAMERA_ROOT</code> folder. 
        Click <strong>Check</strong> to verify if the directory exists on the server.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWait: '50vh', overflowY: 'auto', paddingRight: 4 }}>
        {cameras.map((cam, index) => {
          const check = checkResults[index]
          return (
            <div key={index} style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 12,
              position: 'relative'
            }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {/* ID Input */}
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 3 }}>Camera ID</label>
                  <input
                    type="text"
                    className="modal-text-input"
                    value={cam.id}
                    onChange={e => handleChange(index, 'id', e.target.value)}
                    placeholder="e.g. front_gate"
                    style={{ width: '100%' }}
                  />
                </div>

                {/* Name Input */}
                <div style={{ flex: 2, minWidth: 180 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 3 }}>Display Name</label>
                  <input
                    type="text"
                    className="modal-text-input"
                    value={cam.name}
                    onChange={e => handleChange(index, 'name', e.target.value)}
                    placeholder="e.g. Front Gate Camera"
                    style={{ width: '100%' }}
                  />
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                  <button
                    className="modal-btn danger-outline"
                    onClick={() => handleDelete(index)}
                    title="Delete camera"
                    style={{ padding: '8px 10px', height: 38 }}
                  >
                    <i className="mdi mdi-trash-can-outline" />
                  </button>
                </div>
              </div>

              {/* Path Input & Check */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 3 }}>Relative Folder Path</label>
                  <input
                    type="text"
                    className="modal-text-input"
                    value={cam.path}
                    onChange={e => handleChange(index, 'path', e.target.value)}
                    placeholder="e.g. Foscam/FrontGate"
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38 }}>
                  <button
                    className="modal-btn neutral"
                    onClick={() => handleCheck(index)}
                    disabled={check?.loading}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {check?.loading ? (
                      <i className="mdi mdi-loading mdi-spin" />
                    ) : (
                      <><i className="mdi mdi-folder-key-network-outline" /> Check</>
                    )}
                  </button>
                </div>
              </div>

              {/* Path check result message */}
              {check && !check.loading && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  marginTop: 2,
                  color: check.exists ? '#86efac' : '#fca5a5'
                }}>
                  <i className={`mdi ${check.exists ? 'mdi-check-circle-outline' : 'mdi-alert-circle-outline'}`} />
                  <span style={{ fontWeight: 500 }}>
                    {check.exists ? 'Path exists' : check.error}
                  </span>
                  {check.absolute_path && (
                    <span style={{ opacity: 0.6, fontSize: 11 }}>
                      ({check.absolute_path})
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add Camera Button */}
      <div>
        <button className="modal-btn neutral" onClick={handleAdd} style={{ width: '100%', borderStyle: 'dashed', background: 'transparent' }}>
          <i className="mdi mdi-plus" /> Add Camera
        </button>
      </div>

      {/* Save Button and Status Message */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 'var(--gap-md)', marginTop: 4 }}>
        <button className="modal-btn" onClick={handleSave} disabled={saving} style={{ alignSelf: 'flex-end', minWidth: 120 }}>
          {saving ? <i className="mdi mdi-loading mdi-spin" /> : <><i className="mdi mdi-content-save-outline" /> Save Cameras</>}
        </button>
        {status && (
          <div className={`modal-result ${status.type === 'success' ? 'ok' : 'err'}`} style={{ margin: 0 }}>
            {status.text}
          </div>
        )}
      </div>
    </div>
  )
}
