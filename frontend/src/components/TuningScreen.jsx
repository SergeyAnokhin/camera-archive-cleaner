import { useState, useEffect, useCallback, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  getTuningSessions, createTuningSession, getTuningSession,
  deleteTuningSession, getTuningImageUrl,
  runAutolabel, saveTuningGroundTruth, startTuningBenchmark,
} from '../api.js'

const MODELS = ['yolov8n', 'yolov8s', 'yolov8m']
const MODEL_LABEL = { yolov8n: 'Nano', yolov8s: 'Small', yolov8m: 'Medium' }
const MODEL_COLOR = { yolov8n: '#60a5fa', yolov8s: '#34d399', yolov8m: '#f472b6' }

const STATUS_LABEL = {
  setup: 'Загрузка', ready: 'Готова', running: 'Тест идёт', done: 'Готово', failed: 'Ошибка',
}
const STATUS_COLOR = {
  setup: '#6b7280', ready: '#10b981', running: '#f59e0b', done: '#3b82f6', failed: '#ef4444',
}

const STEP_TITLES = ['Эталон', 'Тест', 'Результаты']

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const S = {
  outer: { display: 'flex', gap: 0, flex: 1, minHeight: 0 },
  sidebar: {
    width: 230, flexShrink: 0, borderRight: '1px solid #1f2937',
    display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto',
  },
  sidebarHeader: {
    padding: '12px 14px 10px', borderBottom: '1px solid #1f2937',
    fontSize: 'calc(var(--font-base) * 0.82)', color: 'var(--text-dim)',
    fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
  },
  sidebarItem: (active) => ({
    padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #111827',
    background: active ? '#1e3a5f' : 'transparent',
    borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
    transition: 'background 0.15s',
  }),
  panel: {
    flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto',
    padding: 'var(--gap-lg)',
  },
  stepper: { display: 'flex', gap: 0, borderBottom: '1px solid #1f2937', marginBottom: 24 },
  stepBtn: (active) => ({
    padding: '8px 20px', cursor: 'pointer', border: 'none',
    background: 'transparent', color: active ? 'var(--accent)' : 'var(--text-dim)',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    fontSize: 'calc(var(--font-base) * 0.9)', fontWeight: active ? 600 : 400,
    marginBottom: -1,
  }),
  error: {
    background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 6,
    padding: '10px 14px', color: '#fca5a5', fontSize: 13, marginBottom: 16,
  },
  tag: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    background: '#1e3a5f', border: '1px solid #2563eb', borderRadius: 4,
    padding: '2px 7px', fontSize: 12, color: '#93c5fd',
  },
  tagX: { cursor: 'pointer', color: '#60a5fa', lineHeight: 1, marginLeft: 2 },
  imgCell: {
    background: '#111827', border: '1px solid #1f2937', borderRadius: 6,
    overflow: 'hidden', display: 'flex', flexDirection: 'column',
  },
  label: { fontSize: 'calc(var(--font-base) * 0.82)', color: 'var(--text-dim)', marginBottom: 4 },
  input: {
    background: '#111827', border: '1px solid #374151', borderRadius: 4,
    color: '#f1f5f9', padding: '6px 10px', fontSize: 'calc(var(--font-base) * 0.9)',
    width: '100%', boxSizing: 'border-box',
  },
  row: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
  progressBar: { height: 6, background: '#1f2937', borderRadius: 3, marginTop: 8, position: 'relative', overflow: 'hidden' },
  progressFill: (pct) => ({ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: 'var(--accent)', transition: 'width 0.5s' }),
}

const tooltipStyle = { background: '#1f2937', border: '1px solid #374151', color: '#f1f5f9', fontSize: 12 }

// ---------------------------------------------------------------------------
// Tiny components
// ---------------------------------------------------------------------------

function Err({ msg }) {
  if (!msg) return null
  return <div style={S.error}><i className="mdi mdi-alert-circle-outline" style={{ marginRight: 6 }} />{msg}</div>
}

function Tag({ label, onRemove }) {
  return (
    <span style={S.tag}>
      {label}
      {onRemove && <span style={S.tagX} onClick={onRemove}>×</span>}
    </span>
  )
}

function ProgressBar({ current, total }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{current} / {total} операций ({pct}%)</div>
      <div style={S.progressBar}><div style={S.progressFill(pct)} /></div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// New session — UPLOAD images
// ---------------------------------------------------------------------------

function NewSessionForm({ onCreated, onCancel }) {
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
        Новая сессия тюнинга
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
        <div style={{ marginTop: 8 }}>Нажмите, чтобы выбрать фотографии</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>можно выбрать сразу 10–30 файлов</div>
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
            Выбрано <strong style={{ color: '#f1f5f9' }}>{files.length}</strong> фото
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
          <div style={S.label}>Название сессии</div>
          <input
            style={S.input}
            placeholder="Например: Тест двора"
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
            ? <><i className="mdi mdi-loading mdi-spin" /> Загрузка…</>
            : <><i className="mdi mdi-plus" /> Создать ({files.length})</>}
        </button>
        <button className="modal-btn neutral" style={{ fontSize: 'calc(var(--font-base) * 0.9)' }} onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 0: Ground truth editor (detect with chosen model, then correct)
// ---------------------------------------------------------------------------

function GroundTruthStep({ session, groundTruth, onGTChange, onAutolabel, onSave, autolabeling, saving, error }) {
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

// ---------------------------------------------------------------------------
// Step 1: Benchmark config (golden-section search)
// ---------------------------------------------------------------------------

function BenchmarkStep({ session, onStart, starting, error }) {
  const [confFrom, setConfFrom] = useState(0.10)
  const [confTo, setConfTo] = useState(0.80)
  const [iterations, setIterations] = useState(6)

  const isRunning = session.status === 'running'
  const isDone = session.status === 'done'
  const cfg = session.benchmark_config ? JSON.parse(session.benchmark_config) : null
  const nImages = JSON.parse(session.images || '[]').length

  return (
    <div>
      <Err msg={error} />

      {!isRunning && !isDone && (
        <div style={{ background: '#111827', borderRadius: 8, border: '1px solid #1f2937', padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <div style={S.label}>Минимальный порог</div>
              <div style={S.row}>
                <input type="range" min={0.05} max={0.5} step={0.05} value={confFrom} onChange={e => setConfFrom(+e.target.value)} style={{ flex: 1 }} />
                <span style={{ fontSize: 13, color: '#f1f5f9', minWidth: 36 }}>{confFrom.toFixed(2)}</span>
              </div>
            </div>
            <div>
              <div style={S.label}>Максимальный порог</div>
              <div style={S.row}>
                <input type="range" min={0.3} max={0.95} step={0.05} value={confTo} onChange={e => setConfTo(+e.target.value)} style={{ flex: 1 }} />
                <span style={{ fontSize: 13, color: '#f1f5f9', minWidth: 36 }}>{confTo.toFixed(2)}</span>
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={S.label}>Шагов уточнения (золотое сечение)</div>
              <div style={S.row}>
                <input type="range" min={3} max={10} step={1} value={iterations} onChange={e => setIterations(+e.target.value)} style={{ flex: 1 }} />
                <span style={{ fontSize: 13, color: '#f1f5f9', minWidth: 20 }}>{iterations}</span>
              </div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
            Поиск ведётся методом золотого сечения отдельно для каждой модели — оптимум по чувствительности находится за {2 + iterations} проб на модель
            {' '}(вместо полного перебора). Всего детекций: {3 * (2 + iterations) * nImages}
            {' '}({3} модели × {2 + iterations} проб × {nImages} фото).
          </div>

          <button
            className="modal-btn primary"
            style={{ fontSize: 'calc(var(--font-base) * 0.9)' }}
            onClick={() => onStart({ confFrom, confTo, iterations })}
            disabled={starting || confFrom >= confTo}
          >
            {starting ? <><i className="mdi mdi-loading mdi-spin" /> Запуск…</> : <><i className="mdi mdi-play" /> Запустить тест</>}
          </button>
        </div>
      )}

      {isRunning && (
        <div style={{ background: '#111827', borderRadius: 8, border: '1px solid #1f2937', padding: '20px 24px' }}>
          <div style={{ ...S.row, marginBottom: 16 }}>
            <i className="mdi mdi-loading mdi-spin" style={{ color: 'var(--accent)', fontSize: 20 }} />
            <span style={{ fontWeight: 600 }}>Поиск оптимума…</span>
          </div>
          {cfg && (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
              Диапазон {cfg.conf_from}–{cfg.conf_to}, {cfg.iterations} шагов золотого сечения на модель
            </div>
          )}
          <ProgressBar current={session.progress_current} total={session.progress_total} />
        </div>
      )}

      {isDone && (
        <div style={{ background: '#052e16', border: '1px solid #166534', borderRadius: 8, padding: '14px 18px', color: '#86efac' }}>
          <i className="mdi mdi-check-circle-outline" style={{ marginRight: 8 }} />
          Тест завершён. Перейдите на вкладку «Результаты».
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2: Results
// ---------------------------------------------------------------------------

function ResultsStep({ session }) {
  const [traceOpen, setTraceOpen] = useState(false)

  if (!session.benchmark_results) {
    return <div style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Результаты появятся после завершения теста.</div>
  }

  const results = JSON.parse(session.benchmark_results)
  const perModel = results.per_model || {}
  const recommended = results.recommended

  // Build chart rows keyed by conf (each model probes its own confs)
  const rows = {}
  for (const m of MODELS) {
    const pm = perModel[m]
    if (!pm) continue
    const byConf = {}
    for (const p of pm.probes) byConf[p.conf] = p   // dedupe reused probes
    for (const p of Object.values(byConf)) {
      const key = p.conf.toFixed(3)
      rows[key] = rows[key] || { conf: p.conf }
      rows[key][`${m}_f1`] = p.f1
      rows[key][`${m}_time`] = p.mean_time_ms
    }
  }
  const chartData = Object.values(rows).sort((a, b) => a.conf - b.conf)

  return (
    <div>
      {/* Recommendation */}
      {recommended && (
        <div style={{ background: '#1c3461', border: '1px solid #2563eb', borderRadius: 8, padding: '14px 18px', marginBottom: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: '#93c5fd' }}>
            <i className="mdi mdi-star" style={{ marginRight: 6 }} />Рекомендация
          </div>
          <div style={{ fontSize: 14 }}>
            <strong>{MODEL_LABEL[recommended.model]}</strong> (порог {recommended.conf?.toFixed(3)}) —
            {' '}F1 {recommended.f1?.toFixed(3)}, точность {recommended.precision?.toFixed(3)},
            {' '}полнота {recommended.recall?.toFixed(3)}, скорость {recommended.mean_time_ms} мс/фото
          </div>
        </div>
      )}

      {/* F1 chart */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>F1-score по порогу уверенности</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ right: 16, top: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="conf" type="number" domain={['dataMin', 'dataMax']} tickFormatter={v => v.toFixed(2)} tick={{ fontSize: 11, fill: '#6b7280' }} />
            <YAxis domain={[0, 1]} tickFormatter={v => v.toFixed(1)} tick={{ fontSize: 11, fill: '#6b7280' }} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [v?.toFixed(3), MODEL_LABEL[name.split('_')[0]]]} labelFormatter={l => `порог ${(+l).toFixed(3)}`} />
            <Legend formatter={name => MODEL_LABEL[name.split('_')[0]]} />
            {MODELS.map(m => (
              <Line key={m} type="monotone" dataKey={`${m}_f1`} name={`${m}_f1`} stroke={MODEL_COLOR[m]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Speed chart */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Время обработки (мс/фото)</div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ right: 16, top: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="conf" type="number" domain={['dataMin', 'dataMax']} tickFormatter={v => v.toFixed(2)} tick={{ fontSize: 11, fill: '#6b7280' }} />
            <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [`${v} мс`, MODEL_LABEL[name.split('_')[0]]]} labelFormatter={l => `порог ${(+l).toFixed(3)}`} />
            <Legend formatter={name => MODEL_LABEL[name.split('_')[0]]} />
            {MODELS.map(m => (
              <Line key={m} type="monotone" dataKey={`${m}_time`} name={`${m}_time`} stroke={MODEL_COLOR[m]} strokeWidth={2} dot={false} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Summary table */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Оптимум по каждой модели</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #374151' }}>
              {['Модель', 'Лучший порог', 'F1', 'Точность', 'Полнота', 'Время (мс)', 'Проб'].map(h => (
                <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 400 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODELS.map(m => {
              const pm = perModel[m]
              const b = pm?.best
              const isRec = recommended?.model === m
              return (
                <tr key={m} style={{ borderBottom: '1px solid #1f2937', background: isRec ? '#1c3461' : 'transparent' }}>
                  <td style={{ padding: '8px 10px', color: MODEL_COLOR[m], fontWeight: 600 }}>{MODEL_LABEL[m]}{isRec && ' ★'}</td>
                  <td style={{ padding: '8px 10px' }}>{b?.conf?.toFixed(3) ?? '–'}</td>
                  <td style={{ padding: '8px 10px' }}>{b?.f1?.toFixed(3) ?? '–'}</td>
                  <td style={{ padding: '8px 10px' }}>{b?.precision?.toFixed(3) ?? '–'}</td>
                  <td style={{ padding: '8px 10px' }}>{b?.recall?.toFixed(3) ?? '–'}</td>
                  <td style={{ padding: '8px 10px' }}>{b?.mean_time_ms ?? '–'}</td>
                  <td style={{ padding: '8px 10px' }}>{pm?.evals ?? '–'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Search trace — proof the optimization narrows the interval */}
      <div>
        <button
          className="modal-btn neutral"
          style={{ fontSize: 'calc(var(--font-base) * 0.85)' }}
          onClick={() => setTraceOpen(v => !v)}
        >
          <i className={`mdi mdi-chevron-${traceOpen ? 'down' : 'right'}`} />
          Трасса поиска (как сужался интервал)
        </button>

        {traceOpen && MODELS.map(m => {
          const pm = perModel[m]
          if (!pm) return null
          return (
            <div key={m} style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 600, color: MODEL_COLOR[m], marginBottom: 6 }}>{MODEL_LABEL[m]}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #374151', color: 'var(--text-dim)' }}>
                    {['#', 'Интервал [lo–hi]', 'Ширина', 'Проба (порог)', 'F1'].map(h => (
                      <th key={h} style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pm.probes.map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1f2937' }}>
                      <td style={{ padding: '4px 8px', color: 'var(--text-dim)' }}>{i + 1}</td>
                      <td style={{ padding: '4px 8px' }}>{p.lo?.toFixed(3)} – {p.hi?.toFixed(3)}</td>
                      <td style={{ padding: '4px 8px', color: 'var(--text-dim)' }}>{(p.hi - p.lo).toFixed(3)}</td>
                      <td style={{ padding: '4px 8px' }}>{p.conf?.toFixed(3)}</td>
                      <td style={{ padding: '4px 8px' }}>{p.f1?.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main TuningScreen
// ---------------------------------------------------------------------------

export default function TuningScreen() {
  const [sessions, setSessions] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [activeStep, setActiveStep] = useState(0)
  const [showingNewForm, setShowingNewForm] = useState(false)
  const [error, setError] = useState(null)

  const [groundTruth, setGroundTruth] = useState({})
  const [autolabeling, setAutolabeling] = useState(false)
  const [savingGT, setSavingGT] = useState(false)
  const [startingBench, setStartingBench] = useState(false)
  const [stepError, setStepError] = useState(null)

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await getTuningSessions())
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => { loadSessions() }, [loadSessions])

  // Poll active session while the benchmark runs
  useEffect(() => {
    if (!activeSession || activeSession.status !== 'running') return
    const id = setInterval(async () => {
      try {
        const data = await getTuningSession(activeSession.id)
        setActiveSession(data)
        setSessions(prev => prev.map(s => s.id === data.id
          ? { ...s, status: data.status, progress_current: data.progress_current, progress_total: data.progress_total }
          : s))
        if (data.status === 'done') setActiveStep(2)
        if (data.status === 'failed') setStepError(data.error_message)
      } catch {}
    }, 2000)
    return () => clearInterval(id)
  }, [activeSession?.id, activeSession?.status])

  async function handleSelectSession(s) {
    setStepError(null); setError(null)
    try {
      const full = await getTuningSession(s.id)
      setActiveSession(full)
      setGroundTruth(JSON.parse(full.ground_truth || '{}'))
      setShowingNewForm(false)
      const stepMap = { setup: 0, ready: 1, running: 1, done: 2, failed: 1 }
      setActiveStep(stepMap[full.status] ?? 0)
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleDeleteSession(id, e) {
    e.stopPropagation()
    try {
      await deleteTuningSession(id)
      setSessions(prev => prev.filter(s => s.id !== id))
      if (activeSession?.id === id) { setActiveSession(null); setShowingNewForm(false) }
    } catch (e) {
      setError(e.message)
    }
  }

  function handleSessionCreated(session) {
    loadSessions()
    setActiveSession(session)
    setGroundTruth({})
    setActiveStep(0)
    setShowingNewForm(false)
    setStepError(null)
  }

  function handleGTChange(imageId, objects) {
    setGroundTruth(prev => ({ ...prev, [imageId]: objects }))
  }

  async function handleAutolabel({ model, confidence }) {
    if (!activeSession) return
    setAutolabeling(true); setStepError(null)
    try {
      const result = await runAutolabel(activeSession.id, { model, confidence })
      setGroundTruth(result.ground_truth)
    } catch (e) {
      setStepError(e.message)
    } finally {
      setAutolabeling(false)
    }
  }

  async function handleSaveGT() {
    if (!activeSession) return
    setSavingGT(true); setStepError(null)
    try {
      await saveTuningGroundTruth(activeSession.id, groundTruth)
      const updated = await getTuningSession(activeSession.id)
      setActiveSession(updated)
      setSessions(prev => prev.map(s => s.id === updated.id ? { ...s, status: updated.status } : s))
      setActiveStep(1)
    } catch (e) {
      setStepError(e.message)
    } finally {
      setSavingGT(false)
    }
  }

  async function handleStartBenchmark(cfg) {
    if (!activeSession) return
    setStartingBench(true); setStepError(null)
    try {
      await startTuningBenchmark(activeSession.id, cfg)
      const updated = await getTuningSession(activeSession.id)
      setActiveSession(updated)
      setSessions(prev => prev.map(s => s.id === updated.id ? { ...s, status: updated.status } : s))
    } catch (e) {
      setStepError(e.message)
    } finally {
      setStartingBench(false)
    }
  }

  const imageCount = activeSession ? JSON.parse(activeSession.images || '[]').length : 0

  return (
    <div style={S.outer}>
      {/* Sidebar */}
      <div style={S.sidebar}>
        <div style={S.sidebarHeader}>Сессии тюнинга</div>
        <div style={{ padding: '10px 12px 8px' }}>
          <button
            className="modal-btn primary"
            style={{ width: '100%', fontSize: 'calc(var(--font-base) * 0.85)' }}
            onClick={() => { setShowingNewForm(true); setActiveSession(null); setStepError(null) }}
          >
            <i className="mdi mdi-plus" /> Новая сессия
          </button>
        </div>

        {sessions.length === 0 && (
          <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>Нет сессий</div>
        )}

        {sessions.map(s => (
          <div key={s.id} style={S.sidebarItem(activeSession?.id === s.id)} onClick={() => handleSelectSession(s)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
              <div style={{ fontWeight: 600, fontSize: 'calc(var(--font-base) * 0.88)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
              <button
                className="modal-btn neutral"
                style={{ padding: '1px 5px', fontSize: 10, flexShrink: 0, lineHeight: '14px' }}
                onClick={e => handleDeleteSession(s.id, e)}
                title="Удалить"
              >×</button>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
              <span style={{ fontSize: 10, color: STATUS_COLOR[s.status] || '#6b7280', fontWeight: 600 }}>{STATUS_LABEL[s.status] || s.status}</span>
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>· {s.image_count} фото</span>
            </div>
            {s.status === 'running' && s.progress_total > 0 && (
              <div style={{ marginTop: 6 }}>
                <div style={S.progressBar}><div style={S.progressFill(Math.round((s.progress_current / s.progress_total) * 100))} /></div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Right panel */}
      <div style={S.panel}>
        <Err msg={error} />

        {showingNewForm ? (
          <NewSessionForm onCreated={handleSessionCreated} onCancel={() => setShowingNewForm(false)} />
        ) : activeSession ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 'calc(var(--font-base) * 1.05)' }}>{activeSession.name}</span>
                <span style={{ marginLeft: 12, fontSize: 12, color: STATUS_COLOR[activeSession.status] }}>{STATUS_LABEL[activeSession.status]}</span>
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{imageCount} изображений</span>
            </div>

            <div style={S.stepper}>
              {STEP_TITLES.map((title, i) => (
                <button key={i} style={S.stepBtn(activeStep === i)} onClick={() => setActiveStep(i)}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 18, height: 18, borderRadius: '50%', fontSize: 10, fontWeight: 700,
                    marginRight: 6, background: activeStep === i ? 'var(--accent)' : '#374151',
                    color: activeStep === i ? '#fff' : '#9ca3af',
                  }}>{i + 1}</span>
                  {title}
                </button>
              ))}
            </div>

            {activeStep === 0 && (
              <GroundTruthStep
                session={activeSession}
                groundTruth={groundTruth}
                onGTChange={handleGTChange}
                onAutolabel={handleAutolabel}
                onSave={handleSaveGT}
                autolabeling={autolabeling}
                saving={savingGT}
                error={stepError}
              />
            )}
            {activeStep === 1 && (
              <BenchmarkStep session={activeSession} onStart={handleStartBenchmark} starting={startingBench} error={stepError} />
            )}
            {activeStep === 2 && <ResultsStep session={activeSession} />}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-dim)' }}>
            <i className="mdi mdi-tune-variant" style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }} />
            <div style={{ marginBottom: 12 }}>Создайте сессию или выберите существующую</div>
            <button className="modal-btn primary" style={{ fontSize: 'calc(var(--font-base) * 0.9)' }} onClick={() => setShowingNewForm(true)}>
              <i className="mdi mdi-plus" /> Новая сессия
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
