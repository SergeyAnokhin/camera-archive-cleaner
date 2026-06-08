import { useState, useEffect, useRef } from 'react'
import { getComputeConfig, saveComputeConfig, pingComputeConfig } from '../../api.js'
import { COMPUTE_MODE_KEY, COMPUTE_URL_KEY } from './settingsConfig.js'
import './ComputeTab.css'

const _KUBERNETES_URL = 'http://camera-cleaner-compute:8001'

function detectLocalUrl() {
  return `http://${window.location.hostname}:8001`
}

function effectiveUrl(mode, url) {
  if (mode === 'kubernetes') return _KUBERNETES_URL
  if (mode === 'local')      return detectLocalUrl()
  if (mode === 'remote')     return url || null
  return null
}

const MODES = [
  { value: 'off',
    label: 'Отключён',
    hint: 'Тяжёлые расчёты недоступны. Режим OpenVINO и превью видео скрыты.' },
  { value: 'kubernetes',
    label: 'Kubernetes',
    hint: `Поиск через DNS кластера (${_KUBERNETES_URL}).` },
  { value: 'local',
    label: 'Локально',
    hint: null }, // rendered dynamically with detected URL
  { value: 'remote',
    label: 'Свой адрес',
    hint: 'Compute-сервис по произвольному URL — укажите адрес ниже.' },
]

export default function ComputeTab() {
  const [mode, setMode]         = useState('kubernetes')
  const [url, setUrl]           = useState('')
  const [loaded, setLoaded]     = useState(false)
  const [saving, setSaving]     = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [probing, setProbing]   = useState(false)
  const [probe, setProbe]       = useState(null) // { url, backend, browser }
  const abortRef = useRef(null)

  useEffect(() => {
    getComputeConfig()
      .then(cfg => { setMode(cfg.mode); setUrl(cfg.remote_url || '') })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  // Auto-probe on mode / url change
  useEffect(() => {
    if (!loaded || mode === 'off') { setProbe(null); return }
    const t = setTimeout(() => runProbe(mode, url), 400)
    return () => clearTimeout(t)
  }, [mode, url, loaded])

  async function runProbe(m, u) {
    if (abortRef.current) abortRef.current.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setProbing(true)
    setProbe(null)

    const target = effectiveUrl(m, u)
    // For backend ping: local mode must pass the detected URL as remote_url
    const pingUrl = m === 'local' ? detectLocalUrl() : u

    const [backRes, browRes] = await Promise.allSettled([
      pingComputeConfig(m, pingUrl),
      probeBrowser(target, ctrl.signal),
    ])

    if (ctrl.signal.aborted) return

    setProbe({
      url: target,
      backend: backRes.status === 'fulfilled'
        ? backRes.value
        : { reachable: false, error: backRes.reason?.message },
      browser: browRes.status === 'fulfilled'
        ? browRes.value
        : { reachable: false, error: browRes.reason?.message },
    })
    setProbing(false)
  }

  async function probeBrowser(target, signal) {
    if (!target) return { reachable: false, error: 'URL не задан' }
    try {
      // no-cors: throws on network failure, returns opaque response if server responds
      await fetch(`${target}/health`, { method: 'GET', mode: 'no-cors', signal })
      return { reachable: true }
    } catch (e) {
      if (e.name === 'AbortError') throw e
      return { reachable: false, error: e.message }
    }
  }

  async function handleSave() {
    setSaving(true)
    setSavedMsg('')
    const saveUrl = mode === 'local' ? detectLocalUrl() : url
    try {
      const cfg = await saveComputeConfig(mode, saveUrl)
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

  const localUrl = detectLocalUrl()

  return (
    <>
      <div className="modal-section">
        <div className="modal-section-title">Compute-сервис (тяжёлые расчёты)</div>
        <div className="modal-setting-hint">
          Детекция объектов (YOLO/OpenVINO) и обработка видео выполняются отдельным сервисом.
        </div>
        <div className="compute-modes">
          {MODES.map(m => (
            <label key={m.value} className={`compute-mode${mode === m.value ? ' active' : ''}`}>
              <input
                type="radio"
                name="compute-mode"
                value={m.value}
                checked={mode === m.value}
                onChange={() => setMode(m.value)}
              />
              <div>
                <div className="compute-mode-label">{m.label}</div>
                <div className="compute-mode-hint">
                  {m.value === 'local'
                    ? `Compute-сервис на текущей машине (${localUrl}).`
                    : m.hint}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {mode === 'remote' && (
        <div className="modal-section">
          <div className="modal-section-title">Адрес сервиса</div>
          <input
            className="compute-url-input"
            type="text"
            placeholder="http://192.168.1.50:8001"
            value={url}
            onChange={e => setUrl(e.target.value)}
          />
          <div className="modal-setting-hint">Базовый URL API compute-сервиса.</div>
        </div>
      )}

      <div className="modal-section">
        <button className="modal-btn" onClick={handleSave} disabled={saving}>
          <i className="mdi mdi-content-save" /> Сохранить
        </button>
        {savedMsg && <span className="compute-saved">{savedMsg}</span>}
      </div>

      {mode !== 'off' && (
        <div className="modal-section">
          <div className="modal-section-title">Статус</div>
          {probing ? (
            <div className="compute-status">⏳ Проверка…</div>
          ) : probe ? (
            <div className="compute-probe-rows">
              <ProbeRow label="Backend" result={probe.backend} url={probe.url} />
              <ProbeRow label="Браузер" result={probe.browser} url={probe.url} />
            </div>
          ) : null}
        </div>
      )}
    </>
  )
}

function ProbeRow({ label, result, url }) {
  const ok = result?.reachable
  return (
    <div className={`compute-probe-row${ok ? ' ok' : ' err'}`}>
      <span className="probe-dot">{ok ? '🟢' : '🔴'}</span>
      <span className="probe-label">{label}</span>
      <span className="probe-detail">
        {ok
          ? `Доступен — ${url}`
          : `Недоступен${result?.error ? ` (${result.error})` : ''}`}
      </span>
    </div>
  )
}
