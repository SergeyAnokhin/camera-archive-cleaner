import { useState, useEffect, useRef, useCallback } from 'react'
import { getComputeConfig, saveComputeConfig, pingComputeConfig, discoverCompute } from '../../api.js'
import { COMPUTE_MODE_KEY, COMPUTE_URL_KEY, COMPUTE_MODE_UI_KEY } from './settingsConfig.js'
import './ComputeTab.css'

const MODES = [
  {
    value: 'off',
    label: 'Отключён',
    hint: 'Тяжёлые расчёты недоступны. Режимы OpenVINO и видео-превью скрыты.',
  },
  {
    value: 'cluster',
    label: 'Кластер (бэкенд-сервер)',
    hint: 'Compute-сервис в том же окружении, что и бэкенд — Kubernetes, Docker или localhost.',
  },
  {
    value: 'browser',
    label: 'Эта машина',
    hint: 'Compute-сервис на компьютере, где открыт этот сайт. IP определяется через браузер.',
  },
  {
    value: 'remote',
    label: 'Свой адрес',
    hint: 'Compute-сервис по произвольному URL — введите адрес ниже.',
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
      // ICE candidate string contains the IP: "candidate:... IP ..."
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

function toBackendArgs(uiMode, clusterUrl, browserUrl, remoteUrl) {
  if (uiMode === 'off')     return { mode: 'off',    remoteUrl: '' }
  if (uiMode === 'cluster') return { mode: 'remote', remoteUrl: clusterUrl }
  if (uiMode === 'browser') return { mode: 'remote', remoteUrl: browserUrl }
  return { mode: 'remote', remoteUrl }
}

function toUiMode(backendMode, backendUrl, savedUiMode) {
  if (backendMode === 'off')  return 'off'
  if (backendMode === 'local') return 'cluster'   // old-style local (same-machine dev)
  // remote — distinguish by saved UI preference
  if (savedUiMode === 'cluster') return 'cluster'
  if (savedUiMode === 'browser') return 'browser'
  return 'remote'
}

export default function ComputeTab() {
  const [uiMode, setUiMode]           = useState('cluster')
  // cluster mode: url discovered via /compute/discover
  const [clusterUrl, setClusterUrl]   = useState('')
  const [clusterDiscovered, setClusterDiscovered] = useState(false)
  // browser mode: IP detected via WebRTC, user-editable
  const [browserUrl, setBrowserUrl]   = useState('http://:8001')
  // remote mode: manual input
  const [remoteUrl, setRemoteUrl]     = useState('')

  const [loaded, setLoaded]           = useState(false)
  const [saving, setSaving]           = useState(false)
  const [savedMsg, setSavedMsg]       = useState('')
  const [probes, setProbes]           = useState(null)
  const [checking, setChecking]       = useState(false)

  const abortRef = useRef(null)

  // ── Probe runner ──────────────────────────────────────────────────────────
  const runCheck = useCallback(async (mode, cUrl, bUrl, rUrl) => {
    if (abortRef.current) abortRef.current.abort()
    const ac = new AbortController()
    abortRef.current = ac

    if (mode === 'off') { setProbes(null); setChecking(false); return }

    setChecking(true)
    setProbes(null)

    try {
      if (mode === 'cluster') {
        // Backend discovers by itself
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
          setProbes({
            backend: {
              reachable: true,
              url: discovered.url,
              capabilities: discovered.health?.capabilities || [],
            },
          })
        } else {
          setClusterUrl('')
          setClusterDiscovered(false)
          setProbes({
            backend: { reachable: false, url: '(не найдено)', error: 'localhost:8001 и camera-cleaner-compute:8001 недоступны' },
          })
        }
      } else if (mode === 'browser') {
        // Backend probe: use the browserUrl that was set (WebRTC result)
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
        // Browser probe: direct localhost:8001 fetch
        try {
          const h = await fetch('http://localhost:8001/health', {
            signal: AbortSignal.timeout(3000),
          }).then(r => r.json())
          browserProbe = { reachable: h.status === 'ok', url: 'http://localhost:8001', capabilities: h.capabilities || [] }
        } catch (e) {
          browserProbe = { reachable: false, url: 'http://localhost:8001', error: e.message }
        }
        if (!ac.signal.aborted) setProbes({ backend: backendProbe, browser: browserProbe })
      } else {
        // remote
        if (!URL_RE.test(rUrl)) { setChecking(false); setProbes(null); return }
        let backendProbe
        try {
          backendProbe = await pingComputeConfig('remote', rUrl)
        } catch (e) {
          backendProbe = { reachable: false, url: rUrl, error: e.message }
        }
        if (!ac.signal.aborted) setProbes({ backend: backendProbe })
      }
    } finally {
      if (!ac.signal.aborted) setChecking(false)
    }
  }, [])

  // ── WebRTC detect (only called for browser mode) ──────────────────────────
  const detectBrowserIP = useCallback(async () => {
    try {
      const ip = await getWebRTCLocalIP()
      const url = `http://${ip}:8001`
      setBrowserUrl(url)
      return url
    } catch (_) {
      // WebRTC failed — leave field editable, user fills manually
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
        if (ui === 'cluster') { setClusterUrl(savedUrl); if (savedUrl) setClusterDiscovered(true) }
        if (ui === 'browser') setBrowserUrl(savedUrl || 'http://:8001')
        if (ui === 'remote')  setRemoteUrl(savedUrl)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  // ── Auto-check on mode switch ─────────────────────────────────────────────
  useEffect(() => {
    if (!loaded) return
    setProbes(null)

    if (uiMode === 'remote') return  // handled by URL effect

    if (uiMode === 'browser') {
      // Detect IP first, then check
      ;(async () => {
        const detected = await detectBrowserIP()
        const url = detected || browserUrl
        runCheck('browser', clusterUrl, url, remoteUrl)
      })()
      return
    }

    const t = setTimeout(() => runCheck(uiMode, clusterUrl, browserUrl, remoteUrl), 150)
    return () => clearTimeout(t)
  }, [uiMode, loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-check when remote URL changes ───────────────────────────────────
  useEffect(() => {
    if (!loaded || uiMode !== 'remote') return
    setProbes(null)
    if (!URL_RE.test(remoteUrl)) return
    const t = setTimeout(() => runCheck('remote', clusterUrl, browserUrl, remoteUrl), 600)
    return () => clearTimeout(t)
  }, [remoteUrl, loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Re-check browser mode when URL is edited ─────────────────────────────
  useEffect(() => {
    if (!loaded || uiMode !== 'browser') return
    if (!URL_RE.test(browserUrl)) return
    const t = setTimeout(() => runCheck('browser', clusterUrl, browserUrl, remoteUrl), 600)
    return () => clearTimeout(t)
  }, [browserUrl, loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (uiMode === 'cluster' && !clusterUrl) {
      setSavedMsg('Ошибка: сервис не обнаружен — проверьте состояние кластера')
      return
    }
    if (uiMode === 'browser' && !URL_RE.test(browserUrl)) {
      setSavedMsg('Ошибка: IP не определён — проверьте или введите вручную')
      return
    }
    setSaving(true)
    setSavedMsg('')
    try {
      const args = toBackendArgs(uiMode, clusterUrl, browserUrl, remoteUrl)
      const cfg  = await saveComputeConfig(args.mode, args.remoteUrl)
      localStorage.setItem(COMPUTE_MODE_UI_KEY, uiMode)
      localStorage.setItem(COMPUTE_MODE_KEY,    cfg.mode)
      localStorage.setItem(COMPUTE_URL_KEY,     cfg.remote_url || '')
      setSavedMsg('Сохранено')
    } catch (e) {
      setSavedMsg('Ошибка: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return <div className="modal-section">Загрузка…</div>

  return (
    <>
      {/* Mode cards */}
      <div className="modal-section">
        <div className="modal-section-title">Compute-сервис (тяжёлые расчёты)</div>
        <div className="modal-setting-hint">
          Детекция объектов (YOLO/OpenVINO) и обработка видео. Проверка выполняется
          автоматически при переключении режима.
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
            Обнаружен в кластере: <strong>{clusterUrl}</strong>
          </div>
        </div>
      )}

      {/* Browser: editable URL (pre-filled by WebRTC) */}
      {uiMode === 'browser' && (
        <div className="modal-section">
          <div className="modal-section-title">Адрес на этой машине</div>
          <input
            className="compute-url-input"
            type="text"
            placeholder="http://192.168.1.21:8001"
            value={browserUrl}
            onChange={e => { setBrowserUrl(e.target.value); setSavedMsg('') }}
          />
          <div className="modal-setting-hint">
            IP определяется через браузер (WebRTC). Если неверный — исправьте вручную.
          </div>
        </div>
      )}

      {/* Remote: manual URL */}
      {uiMode === 'remote' && (
        <div className="modal-section">
          <div className="modal-section-title">Адрес сервиса</div>
          <input
            className="compute-url-input"
            type="text"
            placeholder="http://192.168.1.50:8001"
            value={remoteUrl}
            onChange={e => { setRemoteUrl(e.target.value); setSavedMsg('') }}
          />
          <div className="modal-setting-hint">
            Проверка выполняется автоматически по мере ввода.
          </div>
        </div>
      )}

      {/* Probes */}
      {uiMode !== 'off' && (
        <div className="modal-section">
          {checking ? (
            <div className="compute-status off">⏳ Проверка…</div>
          ) : probes ? (
            <div className="compute-probe-rows">
              {probes.backend && (
                <ProbeRow label="Бэкенд" probe={probes.backend} />
              )}
              {probes.browser && (
                <ProbeRow label="Браузер" probe={probes.browser} />
              )}
            </div>
          ) : uiMode === 'remote' && !URL_RE.test(remoteUrl) ? (
            <div className="compute-status off">— Введите URL для автопроверки</div>
          ) : uiMode === 'browser' && !URL_RE.test(browserUrl) ? (
            <div className="compute-status off">— Определение IP…</div>
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
          <i className="mdi mdi-content-save" /> Сохранить
        </button>
        {savedMsg && <span className="compute-saved">{savedMsg}</span>}
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
          ? `🟢 Доступен — ${probe.url}${probe.capabilities?.length ? ' · ' + probe.capabilities.join(', ') : ''}`
          : `🔴 Недоступен${probe.url ? ' — ' + probe.url : ''}${probe.error ? ' (' + probe.error + ')' : ''}`
        }
      </span>
    </div>
  )
}
