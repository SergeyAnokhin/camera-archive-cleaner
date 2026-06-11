import { useState, useEffect, useRef } from 'react'
import { createTuningSession } from '../../api.js'
import { S, Err } from './tuningShared.jsx'

// New session — UPLOAD images
export default function NewSessionForm({ onCreated, onCancel }) {
  const [sessionName, setSessionName] = useState('')
  const [files, setFiles] = useState([])
  const [previews, setPreviews] = useState([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    const urls = files.map(f => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach(u => URL.revokeObjectURL(u))
  }, [files])

  function handleFilesChosen(e) {
    const chosen = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'))
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name + f.size))
      const merged = [...prev]
      for (const f of chosen) if (!names.has(f.name + f.size)) merged.push(f)
      return merged
    })
  }

  function removeFile(idx) {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleCreate() {
    if (!sessionName.trim() || files.length === 0) return
    setCreating(true)
    setError(null)
    try {
      const session = await createTuningSession({ name: sessionName.trim(), files })
      onCreated(session)
    } catch (e) {
      setError(e.message)
      setCreating(false)
    }
  }

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 'calc(var(--font-base) * 1.1)', marginBottom: 20 }}>
        New tuning session
      </div>

      <Err msg={error} />

      {/* Drop / pick area */}
      <div
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: '2px dashed #374151', borderRadius: 8, padding: '28px 20px',
          textAlign: 'center', cursor: 'pointer', marginBottom: 16,
          color: 'var(--text-dim)', background: '#0f1623',
        }}
      >
        <i className="mdi mdi-cloud-upload-outline" style={{ fontSize: 36, opacity: 0.6 }} />
        <div style={{ marginTop: 8 }}>Click to choose photos</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>select 10–30 files at once</div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFilesChosen}
        />
      </div>

      {/* Selected previews */}
      {files.length > 0 && (
        <>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 10 }}>
            Selected <strong style={{ color: '#f1f5f9' }}>{files.length}</strong> photos
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
            gap: 6, marginBottom: 20, maxHeight: 320, overflowY: 'auto',
          }}>
            {files.map((f, i) => (
              <div key={i} style={{ position: 'relative', borderRadius: 5, overflow: 'hidden', border: '1px solid #1f2937' }}>
                <img src={previews[i]} alt="" style={{ width: '100%', height: 80, objectFit: 'cover', display: 'block' }} />
                <button
                  className="modal-btn neutral"
                  style={{ position: 'absolute', top: 2, right: 2, padding: '0 5px', fontSize: 11, lineHeight: '16px' }}
                  onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                >×</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Name + create */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={S.label}>Session name</div>
          <input
            style={S.input}
            placeholder="e.g. Backyard test"
            value={sessionName}
            onChange={e => setSessionName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
        </div>
        <button
          className="modal-btn primary"
          style={{ fontSize: 'calc(var(--font-base) * 0.9)' }}
          onClick={handleCreate}
          disabled={creating || !sessionName.trim() || files.length === 0}
        >
          {creating
            ? <><i className="mdi mdi-loading mdi-spin" /> Uploading…</>
            : <><i className="mdi mdi-plus" /> Create ({files.length})</>}
        </button>
        <button className="modal-btn neutral" style={{ fontSize: 'calc(var(--font-base) * 0.9)' }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
