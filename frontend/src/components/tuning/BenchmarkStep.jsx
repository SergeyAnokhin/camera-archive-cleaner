import { useState } from 'react'
import { S, Err, ProgressBar } from './tuningShared.jsx'

// Step 1: Benchmark config (golden-section search)
export default function BenchmarkStep({ session, onStart, starting, error }) {
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
