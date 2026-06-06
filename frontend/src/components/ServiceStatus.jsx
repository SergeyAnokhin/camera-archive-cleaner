import { useState, useEffect } from 'react'

function fmtMem(bytes) {
  if (bytes == null) return '—'
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)}G`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)}M`
  return `${Math.round(bytes / 1e3)}K`
}

function cpuColor(v) {
  if (v > 85) return '#ef4444'
  if (v > 60) return '#f59e0b'
  return 'var(--accent)'
}

function memColor(v) {
  if (v > 85) return '#ef4444'
  if (v > 70) return '#f59e0b'
  return '#22c55e'
}

function MiniBar({ pct, color }) {
  return (
    <div className="svc-bar-track">
      <div className="svc-bar-fill" style={{ width: `${pct ?? 0}%`, background: color }} />
    </div>
  )
}

function ServiceChip({ name, url, docsUrl, up, cpuPct, memPct, memUsed }) {
  const tooltip = url ? `${url}\nНажмите для открытия API docs` : 'Адрес не задан'
  return (
    <a
      className="svc-chip"
      href={docsUrl || undefined}
      target="_blank"
      rel="noopener noreferrer"
      title={tooltip}
      onClick={e => { if (!docsUrl) e.preventDefault() }}
    >
      <div className="svc-chip-header">
        <span className={`svc-dot ${up ? 'svc-dot--up' : 'svc-dot--down'}`} />
        <span className="svc-chip-name">{name}</span>
      </div>
      <div className="svc-chip-bars">
        <div className="svc-bar-row">
          <span className="svc-bar-lbl">CPU</span>
          <MiniBar pct={cpuPct} color={cpuColor(cpuPct ?? 0)} />
          <span className="svc-bar-val">{cpuPct != null ? `${cpuPct.toFixed(0)}%` : '—'}</span>
        </div>
        <div className="svc-bar-row">
          <span className="svc-bar-lbl">RAM</span>
          <MiniBar pct={memPct} color={memColor(memPct ?? 0)} />
          <span className="svc-bar-val">{fmtMem(memUsed)}</span>
        </div>
      </div>
    </a>
  )
}

export default function ServiceStatus() {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const res = await fetch('/api/services/status')
        if (!cancelled && res.ok) setStatus(await res.json())
      } catch {}
      if (!cancelled) setTimeout(poll, 1000)
    }
    poll()
    return () => { cancelled = true }
  }, [])

  if (!status) return null

  const backendUrl = window.location.origin + '/api'
  const backendDocsUrl = window.location.origin + '/api/docs'

  const compute = status.compute
  const showCompute = compute?.mode !== 'off'
  const computeDocsUrl = compute?.url ? `${compute.url}/docs` : null

  return (
    <div className="svc-status">
      <ServiceChip
        name="Backend"
        url={backendUrl}
        docsUrl={backendDocsUrl}
        up={true}
        cpuPct={status.backend?.cpu_percent}
        memPct={status.backend?.memory_percent}
        memUsed={status.backend?.memory_used}
      />
      {showCompute && (
        <ServiceChip
          name="Compute"
          url={compute.url}
          docsUrl={computeDocsUrl}
          up={compute.reachable}
          cpuPct={compute.cpu_percent}
          memPct={compute.memory_percent}
          memUsed={compute.memory_used}
        />
      )}
    </div>
  )
}
