import { useState, useEffect } from 'react'
import { getComputeConfig, saveComputeConfig, getComputeStatus } from '../../api.js'
import { COMPUTE_MODE_KEY, COMPUTE_URL_KEY } from './settingsConfig.js'
import './ComputeTab.css'

const MODES = [
  { value: 'off',    label: 'Отключён',
    hint: 'Тяжёлые расчёты недоступны. Режим OpenVINO и превью видео скрыты.' },
  { value: 'local',  label: 'Локально',
    hint: 'Compute-сервис на этой машине (http://localhost:8001).' },
  { value: 'remote', label: 'Удалённо',
    hint: 'Compute-сервис на другой машине — укажите адрес ниже.' },
]

export default function ComputeTab() {
  const [mode, setMode]       = useState('local')
  const [url, setUrl]         = useState('')
  const [loaded, setLoaded]   = useState(false)
  const [saving, setSaving]   = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [status, setStatus]   = useState(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    getComputeConfig()
      .then(cfg => { setMode(cfg.mode); setUrl(cfg.remote_url || '') })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  async function handleSave() {
    setSaving(true)
    setSavedMsg('')
    try {
      const cfg = await saveComputeConfig(mode, url)
      localStorage.setItem(COMPUTE_MODE_KEY, cfg.mode)
      localStorage.setItem(COMPUTE_URL_KEY, cfg.remote_url || '')
      setSavedMsg('Сохранено')
    } catch (e) {
      setSavedMsg('Ошибка: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setStatus(null)
    try {
      setStatus(await getComputeStatus())
    } catch (e) {
      setStatus({ error: e.message })
    } finally {
      setTesting(false)
    }
  }

  if (!loaded) return <div className="modal-section">Загрузка…</div>

  return (
    <>
      <div className="modal-section">
        <div className="modal-section-title">Compute-сервис (тяжёлые расчёты)</div>
        <div className="modal-setting-hint">
          Детекция объектов (YOLO/OpenVINO) и обработка видео выполняются отдельным
          сервисом. Его можно отключить, запустить локально или вынести на другую машину.
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
                <div className="compute-mode-hint">{m.hint}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {mode === 'remote' && (
        <div className="modal-section">
          <div className="modal-section-title">Адрес удалённого сервиса</div>
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
          disabled={testing || mode === 'off'}
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
