import { useState, useEffect } from 'react'
import { getComputeConfig, saveComputeConfig, pingComputeConfig, getComputeClientIp } from '../../api.js'
import { COMPUTE_MODE_KEY, COMPUTE_URL_KEY, COMPUTE_MODE_UI_KEY } from './settingsConfig.js'
import './ComputeTab.css'

// UI-level modes (not 1:1 with backend modes)
const UI_MODES = [
  {
    value: 'off',
    label: 'Отключён',
    hint: 'Тяжёлые расчёты недоступны. Режим OpenVINO и превью видео скрыты.',
  },
  {
    value: 'server',
    label: 'Сервер',
    hint: 'Compute-сервис на той же машине, что и бэкенд (http://localhost:8001 от бэкенда).',
  },
  {
    value: 'browser',
    label: 'Эта машина',
    hint: 'Compute-сервис на компьютере, где открыт браузер — адрес определяется автоматически.',
  },
  {
    value: 'remote',
    label: 'Свой адрес',
    hint: 'Compute-сервис по произвольному URL — укажите адрес ниже.',
  },
]

// Map UI mode to backend {mode, remote_url}
function toBackendArgs(uiMode, url, detectedUrl) {
  if (uiMode === 'off')     return { mode: 'off',    remoteUrl: '' }
  if (uiMode === 'server')  return { mode: 'local',  remoteUrl: '' }
  if (uiMode === 'browser') return { mode: 'remote', remoteUrl: detectedUrl }
  return { mode: 'remote', remoteUrl: url }
}

// Map backend mode back to UI mode (using stored UI preference)
function toUiMode(backendMode, savedUiMode) {
  if (backendMode === 'off')   return 'off'
  if (backendMode === 'local') return 'server'
  // mode=remote could be "browser" (auto-detected) or plain "remote" (manual)
  if (backendMode === 'remote' && savedUiMode === 'browser') return 'browser'
  return 'remote'
}

export default function ComputeTab() {
  const [uiMode, setUiMode]         = useState('server')
  const [url, setUrl]               = useState('')
  const [detectedUrl, setDetectedUrl] = useState('')
  const [loaded, setLoaded]         = useState(false)
  const [saving, setSaving]         = useState(false)
  const [savedMsg, setSavedMsg]     = useState('')
  const [status, setStatus]         = useState(null)
  const [testing, setTesting]       = useState(false)
  const [detecting, setDetecting]   = useState(false)
  const [detectMsg, setDetectMsg]   = useState('')

  useEffect(() => {
    getComputeConfig()
      .then(cfg => {
        const savedUi = localStorage.getItem(COMPUTE_MODE_UI_KEY) || ''
        const ui = toUiMode(cfg.mode, savedUi)
        setUiMode(ui)
        setUrl(cfg.remote_url || '')
        if (ui === 'browser') setDetectedUrl(cfg.remote_url || '')
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  async function handleSave() {
    if (uiMode === 'browser' && !detectedUrl) {
      setSavedMsg('Ошибка: сначала нажмите «Обнаружить»')
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

  async function handleDetect() {
    setDetecting(true)
    setDetectMsg('')
    setDetectedUrl('')
    try {
      // Step 1: ping localhost:8001 directly from the browser
      const health = await fetch('http://localhost:8001/health', {
        signal: AbortSignal.timeout(3000),
      }).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      if (health.status !== 'ok') throw new Error('Сервис ответил, но не healthy')

      // Step 2: ask the backend which IP it sees for this browser
      const { ip } = await getComputeClientIp()
      const detected = `http://${ip}:8001`
      setDetectedUrl(detected)
      setDetectMsg(`✅ Найден — бэкенд будет обращаться по: ${detected}`)
    } catch (e) {
      setDetectMsg(`🔴 Compute-сервис не найден на localhost:8001 (${e.message})`)
    } finally {
      setDetecting(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setStatus(null)
    try {
      if (uiMode === 'browser') {
        // Test from the browser directly — backend can't reach browser's localhost
        const health = await fetch('http://localhost:8001/health', {
          signal: AbortSignal.timeout(3000),
        }).then(r => r.json())
        setStatus({
          mode: 'browser',
          url: detectedUrl || 'http://localhost:8001',
          reachable: health.status === 'ok',
          capabilities: health.capabilities || [],
        })
      } else {
        const { mode, remoteUrl } = toBackendArgs(uiMode, url, detectedUrl)
        setStatus(await pingComputeConfig(mode, remoteUrl))
      }
    } catch (e) {
      setStatus({ error: e.message })
    } finally {
      setTesting(false)
    }
  }

  const canTest = uiMode !== 'off' && !(uiMode === 'browser' && !detectedUrl)

  if (!loaded) return <div className="modal-section">Загрузка…</div>

  return (
    <>
      <div className="modal-section">
        <div className="modal-section-title">Compute-сервис (тяжёлые расчёты)</div>
        <div className="modal-setting-hint">
          Детекция объектов (YOLO/OpenVINO) и обработка видео выполняются отдельным
          сервисом. Его можно отключить, запустить на том же сервере, на вашем компьютере
          (там, где открыт браузер) или по произвольному адресу.
        </div>
        <div className="compute-modes">
          {UI_MODES.map(m => (
            <label key={m.value} className={`compute-mode${uiMode === m.value ? ' active' : ''}`}>
              <input
                type="radio"
                name="compute-mode"
                value={m.value}
                checked={uiMode === m.value}
                onChange={() => { setUiMode(m.value); setStatus(null); setSavedMsg('') }}
              />
              <div>
                <div className="compute-mode-label">{m.label}</div>
                <div className="compute-mode-hint">{m.hint}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {uiMode === 'browser' && (
        <div className="modal-section">
          <div className="modal-section-title">Обнаружение на этой машине</div>
          <button className="modal-btn neutral" onClick={handleDetect} disabled={detecting}>
            <i className="mdi mdi-radar" /> {detecting ? 'Обнаружение…' : 'Обнаружить'}
          </button>
          {detectMsg && (
            <div className="modal-setting-hint" style={{ marginTop: 8 }}>
              {detectMsg}
            </div>
          )}
          {detectedUrl && (
            <div className="modal-setting-hint">
              Адрес для бэкенда: <strong>{detectedUrl}</strong>
            </div>
          )}
        </div>
      )}

      {uiMode === 'remote' && (
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
        <button
          className="modal-btn neutral"
          style={{ marginLeft: 8 }}
          onClick={handleTest}
          disabled={testing || !canTest}
        >
          <i className="mdi mdi-lan-connect" /> Проверить связь
        </button>
        {savedMsg && <span className="compute-saved">{savedMsg}</span>}
      </div>

      {status && (
        <div className="modal-section">
          <div className="modal-section-title">Статус</div>
          {status.error && status.mode === undefined ? (
            <div className="compute-status err">🔴 {status.error}</div>
          ) : status.mode === 'off' ? (
            <div className="compute-status off">⚪ Compute-сервис отключён</div>
          ) : status.reachable ? (
            <div className="compute-status ok">
              🟢 Доступен — {status.url}
              {status.capabilities?.length > 0 && <span> · {status.capabilities.join(', ')}</span>}
            </div>
          ) : (
            <div className="compute-status err">
              🔴 Недоступен — {status.url || '—'}
              {status.error ? ` (${status.error})` : ''}
            </div>
          )}
        </div>
      )}
    </>
  )
}
