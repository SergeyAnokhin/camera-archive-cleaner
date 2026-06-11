import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { MODELS, MODEL_LABEL, MODEL_COLOR, tooltipStyle } from './tuningShared.jsx'

// Step 2: Results — recommendation, F1/speed charts, per-model table, search trace
export default function ResultsStep({ session }) {
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
