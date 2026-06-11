import { useState } from 'react'
import { getTuningImageUrl } from '../../api.js'
import { S, Err, Tag, MODELS, MODEL_LABEL } from './tuningShared.jsx'

// Step 0: Ground truth editor (detect with chosen model, then correct)
export default function GroundTruthStep({ session, groundTruth, onGTChange, onAutolabel, onSave, autolabeling, saving, error }) {
  const [model, setModel] = useState('yolov8m')
  const [conf, setConf] = useState(0.4)
  const images = JSON.parse(session.images || '[]')
  const [addInputs, setAddInputs] = useState({})

  function setAdd(id, val) { setAddInputs(p => ({ ...p, [id]: val })) }
  function commitAdd(id) {
    const v = (addInputs[id] || '').trim()
    if (!v) return
    onGTChange(id, [...new Set([...(groundTruth[id] || []), v])])
    setAdd(id, '')
  }
  function removeObj(id, obj) {
    onGTChange(id, (groundTruth[id] || []).filter(o => o !== obj))
  }

  const hasLabels = Object.values(groundTruth).some(arr => arr.length > 0)

  return (
    <div>
      <Err msg={error} />

      <div style={{ ...S.row, marginBottom: 20, padding: '12px 16px', background: '#111827', borderRadius: 8, border: '1px solid #1f2937' }}>
        <div>
          <div style={S.label}>Модель для авторазметки</div>
          <select style={{ ...S.input, width: 130 }} value={model} onChange={e => setModel(e.target.value)}>
            {MODELS.map(m => <option key={m} value={m}>{MODEL_LABEL[m]}</option>)}
          </select>
        </div>
        <div>
          <div style={S.label}>Порог</div>
          <div style={{ ...S.row, gap: 8 }}>
            <input type="range" min={0.1} max={0.9} step={0.05} value={conf} onChange={e => setConf(+e.target.value)} style={{ width: 110 }} />
            <span style={{ fontSize: 13, color: '#f1f5f9', minWidth: 32 }}>{conf.toFixed(2)}</span>
          </div>
        </div>
        <button
          className="modal-btn neutral"
          style={{ fontSize: 'calc(var(--font-base) * 0.88)' }}
          onClick={() => onAutolabel({ model, confidence: conf })}
          disabled={autolabeling}
        >
          {autolabeling
            ? <><i className="mdi mdi-loading mdi-spin" /> Детекция…</>
            : <><i className="mdi mdi-auto-fix" /> Детектировать</>}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 20 }}>
        {images.map(img => {
          const objs = groundTruth[img.id] || []
          return (
            <div key={img.id} style={S.imgCell}>
              <img src={getTuningImageUrl(session.id, img.id)} alt="" style={{ width: '100%', height: 120, objectFit: 'cover' }} loading="lazy" />
              <div style={{ padding: '8px 8px 6px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minHeight: 24, marginBottom: 6 }}>
                  {objs.length === 0
                    ? <span style={{ fontSize: 11, color: '#4b5563', fontStyle: 'italic' }}>нет объектов</span>
                    : objs.map(o => <Tag key={o} label={o} onRemove={() => removeObj(img.id, o)} />)}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    style={{ ...S.input, padding: '3px 6px', fontSize: 11 }}
                    placeholder="добавить…"
                    value={addInputs[img.id] || ''}
                    onChange={e => setAdd(img.id, e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && commitAdd(img.id)}
                  />
                  <button className="modal-btn neutral" style={{ padding: '2px 7px', fontSize: 11, flexShrink: 0 }} onClick={() => commitAdd(img.id)}>+</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <button
        className="modal-btn primary"
        style={{ fontSize: 'calc(var(--font-base) * 0.9)' }}
        onClick={onSave}
        disabled={saving || !hasLabels}
      >
        {saving
          ? <><i className="mdi mdi-loading mdi-spin" /> Сохранение…</>
          : <><i className="mdi mdi-check" /> Сохранить эталон и продолжить</>}
      </button>
    </div>
  )
}
