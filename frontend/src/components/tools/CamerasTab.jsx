import { useState, useEffect } from 'react'
import { getCamerasConfig, saveCamerasConfig, checkCameraPath, getCameraRoot, putCameraRoot, getMediaDirs } from '../../api.js'

export default function CamerasTab({ onSaveSuccess }) {
  const [cameras, setCameras] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [checkResults, setCheckResults] = useState({}) // { index: { loading: bool, exists: bool, error: str, absolute_path: str } }
  const [status, setStatus] = useState(null) // { type: 'success' | 'error', text: str }

  // Camera root state
  const [cameraRoot, setCameraRoot] = useState('')
  const [editRoot, setEditRoot] = useState('')
  const [mediaDirs, setMediaDirs] = useState(null) // null = not loaded yet
  const [loadingMediaDirs, setLoadingMediaDirs] = useState(false)
  const [savingRoot, setSavingRoot] = useState(false)
  const [rootStatus, setRootStatus] = useState(null)

  useEffect(() => {
    setLoading(true)
    getCamerasConfig()
      .then(setCameras)
      .catch(err => setStatus({ type: 'error', text: `Failed to load cameras: ${err.message}` }))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    getCameraRoot()
      .then(r => { setCameraRoot(r.camera_root); setEditRoot(r.camera_root) })
      .catch(() => {})
  }, [])

  async function handleBrowseMedia() {
    setLoadingMediaDirs(true)
    setMediaDirs(null)
    try {
      const r = await getMediaDirs()
      setMediaDirs(r)
    } catch (e) {
      setMediaDirs({ exists: false, dirs: [], error: e.message })
    } finally {
      setLoadingMediaDirs(false)
    }
  }

  function handleSelectMediaDir(dirName) {
    const newRoot = dirName === '__media__' ? '/media' : `/media/${dirName}`
    setEditRoot(newRoot)
    setRootStatus(null)
  }

  async function handleSaveRoot() {
    setSavingRoot(true)
    setRootStatus(null)
    try {
      await putCameraRoot(editRoot)
      setCameraRoot(editRoot)
      setRootStatus({ type: 'success', text: 'Camera root saved and applied immediately.' })
    } catch (e) {
      setRootStatus({ type: 'error', text: e.message })
    } finally {
      setSavingRoot(false)
    }
  }

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

      {/* Camera Root section */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 'calc(var(--font-base) * 0.9)', color: 'var(--text-main)' }}>
          <i className="mdi mdi-folder-home-outline" style={{ marginRight: 6 }} />
          Camera Root
        </div>
        <div className="modal-setting-hint" style={{ margin: 0 }}>
          All camera paths below are relative to this folder. In Home Assistant the media share is mounted under <code>/media</code>.
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 3 }}>Current root</label>
            <input
              type="text"
              className="modal-text-input"
              value={editRoot}
              onChange={e => { setEditRoot(e.target.value); setRootStatus(null) }}
              placeholder="/media"
              style={{ width: '100%', fontFamily: 'monospace' }}
            />
          </div>
          <button
            className="modal-btn neutral"
            onClick={handleBrowseMedia}
            disabled={loadingMediaDirs}
            style={{ whiteSpace: 'nowrap', height: 38 }}
          >
            {loadingMediaDirs
              ? <i className="mdi mdi-loading mdi-spin" />
              : <><i className="mdi mdi-folder-search-outline" /> Browse /media</>}
          </button>
          <button
            className="modal-btn"
            onClick={handleSaveRoot}
            disabled={savingRoot || editRoot === cameraRoot}
            style={{ height: 38, whiteSpace: 'nowrap' }}
          >
            {savingRoot ? <i className="mdi mdi-loading mdi-spin" /> : <><i className="mdi mdi-content-save-outline" /> Apply</>}
          </button>
        </div>

        {/* /media directory picker */}
        {mediaDirs && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {!mediaDirs.exists ? (
              <div style={{ color: '#fca5a5', fontSize: 12 }}>
                <i className="mdi mdi-alert-circle-outline" style={{ marginRight: 4 }} />
                {mediaDirs.error || 'The /media directory does not exist on the server. Mount your NAS/NVR share first.'}
              </div>
            ) : mediaDirs.dirs.length === 0 ? (
              <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                <i className="mdi mdi-information-outline" style={{ marginRight: 4 }} />
                /media exists but has no subdirectories. You can use <code>/media</code> directly as root.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Select a folder to use as camera root:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button
                    className="modal-btn neutral"
                    style={{ fontSize: 12, padding: '4px 10px', fontFamily: 'monospace' }}
                    onClick={() => handleSelectMediaDir('__media__')}
                  >
                    /media
                  </button>
                  {mediaDirs.dirs.map(d => (
                    <button
                      key={d}
                      className="modal-btn neutral"
                      style={{ fontSize: 12, padding: '4px 10px', fontFamily: 'monospace' }}
                      onClick={() => handleSelectMediaDir(d)}
                    >
                      /media/{d}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {rootStatus && (
          <div className={`modal-result ${rootStatus.type === 'success' ? 'ok' : 'err'}`} style={{ margin: 0 }}>
            {rootStatus.text}
          </div>
        )}
      </div>

      <div className="modal-setting-hint" style={{ marginBottom: 4 }}>
        <i className="mdi mdi-information-outline" style={{ marginRight: 4 }} />
        Camera paths below are relative to the Camera Root above.
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
