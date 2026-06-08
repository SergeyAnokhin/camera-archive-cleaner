import { useState, useEffect, useRef, useCallback } from 'react'
import { getComputeConfig, saveComputeConfig, pingComputeConfig, getComputeClientIp } from '../../api.js'
import { COMPUTE_MODE_KEY, COMPUTE_URL_KEY, COMPUTE_MODE_UI_KEY } from './settingsConfig.js'
import './ComputeTab.css'

// Four modes — "cluster" maps to backend "local", "browser" maps to backend "remote" + auto-IP
const MODES = [
  {
    value: 'off',
    label: 'Отключён',
    hint: 'Тяжёлые расчёты недоступны. Режимы OpenVINO и видео-превью скрыты.',
  },
  {
    value: 'cluster',
    label: 'Кластер (бэкенд-сервер)',
    hint: 'Compute-сервис запущен в том же окружении, что и бэкенд — Kubernetes, Docker или localhost.',
  },
  {
    value: 'browser',
    label: 'Эта машина',
    hint: 'Compute-сервис запущен на компьютере, с которого открыт этот сайт. IP определяется автоматически.',
  },
  {
    value: 'remote',
    label: 'Свой адрес',
    hint: 'Compute-сервис по произвольному адресу — введите URL ниже.',
  },
]

const URL_RE = /^https?:\/\/[\w%.:-]+:\d+/

function toBackendArgs(uiMode, url, detectedUrl) {
  if (uiMode === 'off')     return { mode: 'off',    remoteUrl: '' }
  if (uiMode === 'cluster') return { mode: 'local',  remoteUrl: '' }
  if (uiMode === 'browser') return { mode: 'remote', remoteUrl: detectedUrl }
  return { mode: 'remote', remoteUrl: url }
}

function toUiMode(backendMode, savedUiMode) {
  if (backendMode === 'off')   return 'off'
  if (backendMode === 'local') return 'cluster'
  if (backendMode === 'remote' && savedUiMode === 'browser') return 'browser'
  return 'remote'
}

export default function ComputeTab() {
  const [uiMode, setUiMode]           = useState('cluster')
  const [url, setUrl]                 = useState('')         // for 'remote' mode
  const [detectedUrl, setDetectedUrl] = useState('')         // for 'browser' mode
  const [loaded, setLoaded]           = useState(false)
  const [saving, setSaving]           = useState(false)
  const [savedMsg, setSavedMsg]       = useState('')
  const [probes, setProbes]           = useState(null)       // {backend, browser}
  const [checking, setChecking]       = useState(false)

  const abortRef = useRef(null)

  // Run probes. backend = /compute/ping result; browser = direct fetch to localhost (browser mode only)
  const runCheck = useCallback(async (mode, checkUrl) => {
    if (abortRef.current) abortRef.current.abort()
    const ac = new AbortController()
    abortRef.current = ac

    if (mode === 'off') { setProbes(null); setChecking(false); return }

    setChecking(true)
    setProbes(null)

    try {
      let backendProbe = null
      let browserProbe = null
      let resolvedUrl  = checkUrl

      if (mode === 'browser') {
        // Step 1: get real client IP from backend (Traefik X-Forwarded-For)
        let ip = 'unknown'
        try {
          const res = await getComputeClientIp()
          ip = res.ip
        } catch (_) {}
        if (ac.signal.aborted) return
        resolvedUrl = `http://${ip}:8001`
        setDetectedUrl(resolvedUrl)

        // Step 2: backend pings detected URL
        try {
          backendProbe = await pingComputeConfig('remote', resolvedUrl)
        } catch (e) {
          backendProbe = { reachable: false, url: resolvedUrl, error: e.message }
        }
        if (ac.signal.aborted) return

        // Step 3: browser pings localhost:8001 directly (compute service is on this machine)
        try {
          const h = await fetch('http://localhost:8001/health', {
            signal: AbortSignal.timeout(3000),
          }).then(r => r.json())
          browserProbe = { reachable: h.status === 'ok', url: 'http://localhost:8001', capabilities: h.capabilities || [] }
        } catch (e) {
          browserProbe = { reachable: false, url: 'http://localhost:8001', error: e.message }
        }
      } else if (mode === 'cluster') {
        try {
          backendProbe = await pingComputeConfig('local', '')
        } catch (e) {
          backendProbe = { reachable: false, url: 'http://localhost:8001', error: e.message }
        }
      } else {
        // remote — only check if URL looks valid
        if (!URL_RE.test(checkUrl)) {
          setChecking(false)
          setProbes(null)
          return
        }
        try {
          backendProbe = await pingComputeConfig('remote', checkUrl)
        } catch (e) {
          backendProbe = { reachable: false, url: checkUrl, error: e.message }
        }
      }

      if (!ac.signal.aborted) setProbes({ backend: backendProbe, browser: browserProbe })
    } finally {
      if (!ac.signal.aborted) setChecking(false)
    }
  }, [])

  // Load config on mount
  useEffect(() => {
    getComputeConfig()
      .then(cfg => {
        const savedUi  = localStorage.getItem(COMPUTE_MODE_UI_KEY) || ''
        const ui       = toUiMode(cfg.mode, savedUi)
        const remoteUrl = cfg.remote_url || ''
        setUiMode(ui)
        setUrl(remoteUrl)
        if (ui === 'browser') setDetectedUrl(remoteUrl)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  // Auto-check when mode switches (after initial load)
  useEffect(() => {
    if (!loaded) return
    setProbes(null)
    const t = setTimeout(() => {
      if (uiMode === 'remote') return  // handled by URL effect
      runCheck(uiMode, uiMode === 'browser' ? detectedUrl : '')
    }, 150)
    return () => clearTimeout(t)
  }, [uiMode, loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-check when URL changes in remote mode (debounced 600ms)
  useEffect(() => {
    if (!loaded || uiMode !== 'remote') return
    setProbes(null)
    if (!URL_RE.test(url)) return
    const t = setTimeout(() => runCheck('remote', url), 600)
    return () => clearTimeout(t)
  }, [url, loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (uiMode === 'browser' && !detectedUrl) {
      setSavedMsg('Подождите — IP ещё определяется')
      return
    }
    setSaving(true)
    setSavedMsg('')
    try {
      const { mode, remoteUrl } = toBackendArgs(uiMode, url, detectedUrl)
      const cfg = await saveComputeConfig(mode, remoteUrl)
      localStorage.setItem(COMPUTE_MODE_UI_KEY, uiMode)
      localStorage.setItem(COMPUTE_MODE_KEY, cfg.mode)
      localStorage.setItem(COMPUTE_URL_KEY, cfg.remote_url || '')
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
      {/* Mode selection */}
      <div className="modal-section">
        <div className="modal-section-title">Compute-сервис (тяжёлые расчёты)</div>
        <div className="modal-setting-hint">
          Детекция объектов (YOLO/OpenVINO) и обработка видео. Статус обновляется
          автоматически при переключении режима.
        </div>
        <div className="compute-modes">
          {MODES.map(m => (
            <label key={m.value} className={`compute-mode${uiMode === m.value ? ' active' : ''}`}>
              <input
                type="radio"
                name="compute-mode"
                value={m.value}
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

      {/* URL input for remote mode */}
      {uiMode === 'remote' && (
        <div className="modal-section">
          <div className="modal-section-title">Адрес сервиса</div>
          <input
            className="compute-url-input"
            type="text"
            placeholder="http://192.168.1.50:8001"
            value={url}
            onChange={e => { setUrl(e.target.value); setSavedMsg('') }}
          />
          <div className="modal-setting-hint">
            Проверка выполняется автоматически по мере ввода.
          </div>
        </div>
      )}

      {/* Status probes */}
      {uiMode !== 'off' && (
        <div className="modal-section">
          {checking ? (
            <div className="compute-status off">⏳ Проверка…</div>
          ) : probes ? (
            <div className="compute-probe-rows">
              {probes.backend && (
                <ProbeRow
                  label="Бэкенд"
                  probe={probes.backend}
                  extra={uiMode === 'browser' ? `→ ${detectedUrl}` : undefined}
                />
              )}
              {probes.browser && (
                <ProbeRow
                  label="Браузер"
                  probe={probes.browser}
                  extra="→ localhost:8001"
                />
              )}
            </div>
          ) : uiMode === 'remote' && !URL_RE.test(url) ? (
            <div className="compute-status off">— Введите URL для автопроверки</div>
          ) : null}
        </div>
      )}

      {/* Save */}
      <div className="modal-section">
        <button
          className="modal-btn"
          onClick={handleSave}
          disabled={saving || (uiMode === 'browser' && !detectedUrl)}
        >
          <i className="mdi mdi-content-save" /> Сохранить
        </button>
        {savedMsg && <span className="compute-saved">{savedMsg}</span>}
      </div>
    </>
  )
}

function ProbeRow({ label, probe, extra }) {
  const ok = probe.reachable
  return (
    <div className={`compute-probe-row ${ok ? 'ok' : 'err'}`}>
      <span className="probe-label">{label}</span>
      <span className="probe-detail">
        {ok ? '🟢' : '🔴'}
        {' '}
        {ok
          ? `Доступен${extra ? ` ${extra}` : (probe.url ? ` — ${probe.url}` : '')}`
          : `Недоступен${probe.url ? ` — ${probe.url}` : ''}${probe.error ? ` (${probe.error})` : ''}`
        }
        {ok && probe.capabilities?.length > 0 && ` · ${probe.capabilities.join(', ')}`}
      </span>
    </div>
  )
}
