import { useState, useEffect, useRef, useCallback } from 'react'
import { getComputeConfig, saveComputeConfig, pingComputeConfig,
         discoverCompute, probeComputeUrls } from '../../api.js'
import { COMPUTE_MODE_KEY, COMPUTE_URL_KEY, COMPUTE_MODE_UI_KEY } from './settingsConfig.js'
import './ComputeTab.css'

const MODES = [
  {
    value: 'off',
    label: 'Off',
    hint: 'Heavy compute unavailable. Detection modes and video previews are hidden.',
  },
  {
    value: 'cluster',
    label: 'Cluster (backend server)',
    hint: 'Compute service in the same environment as the backend — Kubernetes, Docker or localhost.',
  },
  {
    value: 'browser',
    label: 'This machine',
    hint: 'Compute service on the computer where this site is open. IP detected via the browser.',
  },
  {
    value: 'remote',
    label: 'Custom address',
    hint: 'One or more URLs. If the first is unreachable, the next one is tried automatically.',
  },
]

const URL_RE = /^https?:\/\/[\w%.:-]+:\d+/

// Get the machine's own LAN IP via WebRTC (no server needed, works behind NAT/k8s proxies)
function getWebRTCLocalIP() {
  return new Promise((resolve, reject) => {
    const pc = new RTCPeerConnection({ iceServers: [] })
    let resolved = false
    const timer = setTimeout(() => {
      pc.close()
      reject(new Error('WebRTC timeout (3 s)'))
    }, 3000)

    pc.createDataChannel('')
    pc.onicecandidate = e => {
      if (!e || !e.candidate || resolved) return
      const m = /(\d{1,3}(?:\.\d{1,3}){3})/.exec(e.candidate.candidate)
      if (m && !m[1].startsWith('127.') && !m[1].startsWith('169.254.')) {
        resolved = true
        clearTimeout(timer)
        pc.close()
        resolve(m[1])
      }
    }
    pc.createOffer()
      .then(o => pc.setLocalDescription(o))
      .catch(e => { clearTimeout(timer); reject(e) })
  })
}

function toBackendArgs(uiMode, clusterUrl, browserUrl, remoteUrls) {
  if (uiMode === 'off')     return { mode: 'off',    remoteUrl: '',          remoteUrls: [] }
  if (uiMode === 'cluster') return { mode: 'remote', remoteUrl: clusterUrl,  remoteUrls: clusterUrl ? [clusterUrl] : [] }
  if (uiMode === 'browser') return { mode: 'remote', remoteUrl: browserUrl,  remoteUrls: browserUrl ? [browserUrl] : [] }
  const clean = remoteUrls.filter(u => u.trim())
  return { mode: 'remote', remoteUrl: clean[0] || '', remoteUrls: clean }
}

function toUiMode(backendMode, backendUrl, savedUiMode) {
  if (backendMode === 'off')  return 'off'
  if (backendMode === 'local') return 'cluster'
  if (savedUiMode === 'cluster') return 'cluster'
  if (savedUiMode === 'browser') return 'browser'
  return 'remote'
}

export default function ComputeTab() {
  const [uiMode, setUiMode]           = useState('cluster')
  const [clusterUrl, setClusterUrl]   = useState('')
  const [clusterDiscovered, setClusterDiscovered] = useState(false)
  const [browserUrl, setBrowserUrl]   = useState('http://:8001')
  // remote mode: list of URLs
  const [remoteUrls, setRemoteUrls]   = useState([''])

  const [loaded, setLoaded]           = useState(false)
  const [saving, setSaving]           = useState(false)
  const [savedMsg, setSavedMsg]       = useState('')
  const [probes, setProbes]           = useState(null)
  const [checking, setChecking]       = useState(false)

  const abortRef = useRef(null)

  // ── Probe runner ──────────────────────────────────────────────────────────
  const runCheck = useCallback(async (mode, cUrl, bUrl, rUrls) => {
    if (abortRef.current) abortRef.current.abort()
    const ac = new AbortController()
    abortRef.current = ac

    if (mode === 'off') { setProbes(null); setChecking(false); return }

    setChecking(true)
    setProbes(null)

    try {
      if (mode === 'cluster') {
        let discovered
        try {
          discovered = await discoverCompute()
        } catch (e) {
          discovered = { found: false }
        }
        if (ac.signal.aborted) return
        if (discovered.found) {
          setClusterUrl(discovered.url)
          setClusterDiscovered(true)
          setProbes({ backend: { reachable: true, url: discovered.url,
                                 capabilities: discovered.health?.capabilities || [] } })
        } else {
          setClusterUrl('')
          setClusterDiscovered(false)
          setProbes({ backend: { reachable: false, url: '(not found)',
                                 error: 'localhost:8001 and camera-cleaner-compute:8001 are unreachable' } })
        }

      } else if (mode === 'browser') {
        let backendProbe = null
        let browserProbe = null
        if (URL_RE.test(bUrl)) {
          try {
            backendProbe = await pingComputeConfig('remote', bUrl)
          } catch (e) {
            backendProbe = { reachable: false, url: bUrl, error: e.message }
          }
        }
        if (ac.signal.aborted) return
        try {
          const h = await fetch('http://localhost:8001/health', {
            signal: AbortSignal.timeout(3000),
          }).then(r => r.json())
          browserProbe = { reachable: h.status === 'ok', url: 'http://localhost:8001',
                           capabilities: h.capabilities || [] }
        } catch (e) {
          browserProbe = { reachable: false, url: 'http://localhost:8001', error: e.message }
        }
        if (!ac.signal.aborted) setProbes({ backend: backendProbe, browser: browserProbe })

      } else {
        // remote — multi-URL
        const validUrls = (Array.isArray(rUrls) ? rUrls : [rUrls]).filter(u => URL_RE.test(u.trim()))
        if (!validUrls.length) { setChecking(false); setProbes(null); return }
        let urlResults
        try {
          const res = await probeComputeUrls(validUrls)
          urlResults = res.results
        } catch (e) {
          urlResults = validUrls.map(u => ({ url: u, reachable: false, error: e.message }))
        }
        if (!ac.signal.aborted) setProbes({ urls: urlResults })
      }
    } finally {
      if (!ac.signal.aborted) setChecking(false)
    }
  }, [])

  // ── WebRTC detect ─────────────────────────────────────────────────────────
  const detectBrowserIP = useCallback(async () => {
    try {
      const ip = await getWebRTCLocalIP()
      const url = `http://${ip}:8001`
      setBrowserUrl(url)
      return url
    } catch (_) {
      return null
    }
  }, [])

  // ── Load config on mount ──────────────────────────────────────────────────
  useEffect(() => {
    getComputeConfig()
      .then(cfg => {
        const savedUi  = localStorage.getItem(COMPUTE_MODE_UI_KEY) || ''
        const ui       = toUiMode(cfg.mode, cfg.remote_url || '', savedUi)
        setUiMode(ui)
        const savedUrl = cfg.remote_url || ''
        // remote_urls list (with backward compat fallback to single remote_url)
        const savedUrls = cfg.remote_urls?.length
          ? cfg.remote_urls
          : (savedUrl ? [savedUrl] : [''])
        if (ui === 'cluster') { setClusterUrl(savedUrl); if (savedUrl) setClusterDiscovered(true) }
        if (ui === 'browser') setBrowserUrl(savedUrl || 'http://:8001')
        if (ui === 'remote')  setRemoteUrls(savedUrls.length ? savedUrls : [''])
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  // ── Auto-check on mode switch ─────────────────────────────────────────────
  useEffect(() => {
    if (!loaded) return
    setProbes(null)
    if (uiMode === 'remote') return  // handled by URL effect below

    if (uiMode === 'browser') {
      ;(async () => {
        const detected = await detectBrowserIP()
        const url = detected || browserUrl
        runCheck('browser', clusterUrl, url, remoteUrls)
      })()
      return
    }

    const t = setTimeout(() => runCheck(uiMode, clusterUrl, browserUrl, remoteUrls), 150)
    return () => clearTimeout(t)
  }, [uiMode, loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-check when remote URLs change ───────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!loaded || uiMode !== 'remote') return
    setProbes(null)
    const valid = remoteUrls.filter(u => URL_RE.test(u.trim()))
    if (!valid.length) return
    const t = setTimeout(() => runCheck('remote', clusterUrl, browserUrl, remoteUrls), 600)
    return () => clearTimeout(t)
  }, [JSON.stringify(remoteUrls), loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-check browser mode when URL is edited ─────────────────────────────
  useEffect(() => {
    if (!loaded || uiMode !== 'browser') return
    if (!URL_RE.test(browserUrl)) return
    const t = setTimeout(() => runCheck('browser', clusterUrl, browserUrl, remoteUrls), 600)
    return () => clearTimeout(t)
  }, [browserUrl, loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (uiMode === 'cluster' && !clusterUrl) {
      setSavedMsg('Error: service not discovered — check the cluster state')
      return
    }
    if (uiMode === 'browser' && !URL_RE.test(browserUrl)) {
      setSavedMsg('Error: IP not detected — check it or enter manually')
      return
    }
    if (uiMode === 'remote' && !remoteUrls.some(u => URL_RE.test(u.trim()))) {
      setSavedMsg('Error: enter at least one valid URL (http://...)')
      return
    }
    setSaving(true)
    setSavedMsg('')
    try {
      const args = toBackendArgs(uiMode, clusterUrl, browserUrl, remoteUrls)
      const cfg  = await saveComputeConfig(args.mode, args.remoteUrl, args.remoteUrls)
      localStorage.setItem(COMPUTE_MODE_UI_KEY, uiMode)
      localStorage.setItem(COMPUTE_MODE_KEY,    cfg.mode)
      localStorage.setItem(COMPUTE_URL_KEY,     cfg.remote_url || '')
      setSavedMsg('Saved')
      // Re-probe after save to confirm connectivity
      runCheck(uiMode, clusterUrl, browserUrl, remoteUrls)
    } catch (e) {
      setSavedMsg('Error: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return <div className="modal-section">Loading…</div>

  return (
    <>
      {/* Mode cards */}
      <div className="modal-section">
        <div className="modal-section-title">Compute service (heavy processing)</div>
        <div className="modal-setting-hint">
          Object detection (YOLO/OpenVINO) and video processing. Connectivity is
          checked automatically when switching modes.
        </div>
        <div className="compute-modes">
          {MODES.map(m => (
            <label key={m.value} className={`compute-mode${uiMode === m.value ? ' active' : ''}`}>
              <input
                type="radio" name="compute-mode" value={m.value}
                checked={uiMode === m.value}
                onChange={() => { setUiMode(m.value); setSavedMsg('') }}
              />
              <div>
                <div className="compute-mode-label">{m.label}</div>
                <div className="compute-mode-hint">{m.hint}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Cluster: show discovered URL */}
      {uiMode === 'cluster' && clusterDiscovered && clusterUrl && (
        <div className="modal-section">
          <div className="modal-setting-hint">
            Discovered in the cluster: <strong>{clusterUrl}</strong>
          </div>
        </div>
      )}

      {/* Browser: editable URL (pre-filled by WebRTC) */}
      {uiMode === 'browser' && (
        <div className="modal-section">
          <div className="modal-section-title">Address on this machine</div>
          <input
            className="compute-url-input"
            type="text"
            placeholder="http://192.168.1.21:8001"
            value={browserUrl}
            onChange={e => { setBrowserUrl(e.target.value); setSavedMsg('') }}
          />
          <div className="modal-setting-hint">
            IP is detected via the browser (WebRTC). If it is wrong, fix it manually.
          </div>
        </div>
      )}

      {/* Remote: list of URLs */}
      {uiMode === 'remote' && (
        <div className="modal-section">
          <div className="modal-section-title">Service addresses</div>
          {remoteUrls.map((url, i) => (
            <div key={i} className="compute-url-row">
              <input
                className="compute-url-input"
                type="text"
                placeholder="http://192.168.1.50:8001"
                value={url}
                onChange={e => {
                  const next = [...remoteUrls]
                  next[i] = e.target.value
                  setRemoteUrls(next)
                  setSavedMsg('')
                }}
              />
              {remoteUrls.length > 1 && (
                <button
                  className="compute-url-remove"
                  title="Remove"
                  onClick={() => {
                    setRemoteUrls(remoteUrls.filter((_, j) => j !== i))
                    setSavedMsg('')
                  }}
                >
                  <i className="mdi mdi-close" />
                </button>
              )}
            </div>
          ))}
          <button
            className="compute-url-add"
            onClick={() => { setRemoteUrls([...remoteUrls, '']); setSavedMsg('') }}
          >
            <i className="mdi mdi-plus" /> Add URL
          </button>
          <div className="modal-setting-hint" style={{ marginTop: 8 }}>
            If the first address is unreachable, the next one is tried automatically.
            Useful when the service is reachable via different IPs (Wi-Fi / wired network).
          </div>
        </div>
      )}

      {/* Probes */}
      {uiMode !== 'off' && (
        <div className="modal-section">
          {checking ? (
            <div className="compute-status off">⏳ Checking…</div>
          ) : probes ? (
            <div className="compute-probe-rows">
              {probes.backend && <ProbeRow label="Backend" probe={probes.backend} />}
              {probes.browser && <ProbeRow label="Browser" probe={probes.browser} />}
              {probes.urls && probes.urls.map((p, i) => (
                <ProbeRow key={i} label={`URL ${i + 1}`} probe={p} />
              ))}
            </div>
          ) : uiMode === 'remote' && !remoteUrls.some(u => URL_RE.test(u)) ? (
            <div className="compute-status off">— Enter a URL for the auto-check</div>
          ) : uiMode === 'browser' && !URL_RE.test(browserUrl) ? (
            <div className="compute-status off">— Detecting IP…</div>
          ) : null}
        </div>
      )}

      {/* Save */}
      <div className="modal-section">
        <button
          className="modal-btn"
          onClick={handleSave}
          disabled={saving || uiMode === 'off'}
        >
          <i className="mdi mdi-content-save" /> Save
        </button>
        {savedMsg && <span className="compute-saved">{savedMsg}</span>}
      </div>

      {/* Task error threshold */}
      <div className="modal-section">
        <div className="modal-section-title">Task error handling</div>
        <MaxErrorsSetting />
      </div>
    </>
  )
}

const MAX_ERRORS_KEY = 'task_max_errors'
const MAX_ERRORS_DEFAULT = 5

function MaxErrorsSetting() {
  const [value, setValue] = useState(() => {
    const v = parseInt(localStorage.getItem(MAX_ERRORS_KEY) ?? String(MAX_ERRORS_DEFAULT), 10)
    return isNaN(v) ? MAX_ERRORS_DEFAULT : v
  })
  const [saved, setSaved] = useState(false)

  function handleChange(e) {
    const v = parseInt(e.target.value, 10)
    if (!isNaN(v) && v >= 0) setValue(v)
  }

  function handleSave() {
    localStorage.setItem(MAX_ERRORS_KEY, String(value))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <>
      <div className="modal-setting-hint">
        Maximum number of per-file errors before a task stops. Applies to new tasks.
        <strong> 0</strong> — no limit (skip errors indefinitely).
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <input
          type="number"
          min={0}
          max={9999}
          value={value}
          onChange={handleChange}
          style={{
            width: 80,
            background: '#1f2937',
            border: '1px solid #374151',
            borderRadius: 6,
            color: 'var(--text)',
            padding: '4px 8px',
            fontSize: 'inherit',
          }}
        />
        <button className="modal-btn" onClick={handleSave}>
          <i className="mdi mdi-content-save" /> Save
        </button>
        {saved && <span className="compute-saved">Saved</span>}
      </div>
    </>
  )
}

function ProbeRow({ label, probe }) {
  const ok = probe?.reachable
  if (!probe) return null
  return (
    <div className={`compute-probe-row ${ok ? 'ok' : 'err'}`}>
      <span className="probe-label">{label}</span>
      <span className="probe-detail">
        {ok
          ? `🟢 Reachable — ${probe.url}${probe.capabilities?.length ? ' · ' + probe.capabilities.join(', ') : ''}`
          : `🔴 Unreachable${probe.url ? ' — ' + probe.url : ''}${probe.error ? ' (' + probe.error + ')' : ''}`
        }
      </span>
    </div>
  )
}
