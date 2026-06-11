// Shared constants, inline styles and tiny components for the tuning/ steps.

export const MODELS = ['yolov8n', 'yolov8s', 'yolov8m']
export const MODEL_LABEL = { yolov8n: 'Nano', yolov8s: 'Small', yolov8m: 'Medium' }
export const MODEL_COLOR = { yolov8n: '#60a5fa', yolov8s: '#34d399', yolov8m: '#f472b6' }

export const STATUS_LABEL = {
  setup: 'Загрузка', ready: 'Готова', running: 'Тест идёт', done: 'Готово', failed: 'Ошибка',
}
export const STATUS_COLOR = {
  setup: '#6b7280', ready: '#10b981', running: '#f59e0b', done: '#3b82f6', failed: '#ef4444',
}

export const STEP_TITLES = ['Эталон', 'Тест', 'Результаты']

export const S = {
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

export const tooltipStyle = { background: '#1f2937', border: '1px solid #374151', color: '#f1f5f9', fontSize: 12 }

export function Err({ msg }) {
  if (!msg) return null
  return <div style={S.error}><i className="mdi mdi-alert-circle-outline" style={{ marginRight: 6 }} />{msg}</div>
}

export function Tag({ label, onRemove }) {
  return (
    <span style={S.tag}>
      {label}
      {onRemove && <span style={S.tagX} onClick={onRemove}>×</span>}
    </span>
  )
}

export function ProgressBar({ current, total }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{current} / {total} операций ({pct}%)</div>
      <div style={S.progressBar}><div style={S.progressFill(pct)} /></div>
    </div>
  )
}
