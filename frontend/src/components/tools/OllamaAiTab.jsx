import { useState } from 'react'
import { getOllamaModels, pullOllamaModel } from '../../api.js'
import {
  OLLAMA_BASE_URL_KEY, OLLAMA_MODEL_KEY,
  OLLAMA_DEFAULT_URL, OLLAMA_DEFAULT_MODEL,
} from './settingsConfig.js'

export default function OllamaAiTab() {
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem(OLLAMA_BASE_URL_KEY) || OLLAMA_DEFAULT_URL)
  const [model, setModel]     = useState(() => localStorage.getItem(OLLAMA_MODEL_KEY) || OLLAMA_DEFAULT_MODEL)
  const [installed, setInstalled] = useState([])
  const [pullName, setPullName]   = useState('')
  const [busy, setBusy]           = useState(false)
  const [status, setStatus]       = useState(null)

  function handleBaseUrlChange(e) {
    setBaseUrl(e.target.value)
    localStorage.setItem(OLLAMA_BASE_URL_KEY, e.target.value)
  }
  function handleModelChange(e) {
    setModel(e.target.value)
    localStorage.setItem(OLLAMA_MODEL_KEY, e.target.value)
  }

  async function refreshModels() {
    setBusy(true); setStatus(null)
    try {
      const data = await getOllamaModels(baseUrl)
      setInstalled(data.models || [])
      setStatus(`Установлено моделей: ${data.models?.length ?? 0}`)
    } catch (e) {
      setStatus('Ошибка: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  async function handlePull() {
    if (!pullName.trim()) return
    setBusy(true); setStatus(`Загрузка ${pullName}…`)
    try {
      await pullOllamaModel(baseUrl, pullName.trim())
      setStatus(`Модель ${pullName} установлена`)
      setPullName('')
      refreshModels()
    } catch (e) {
      setStatus('Ошибка: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* Base URL */}
      <div className="modal-section">
        <div className="modal-section-title">Base URL</div>
        <input
          type="text"
          className="modal-text-input"
          placeholder={OLLAMA_DEFAULT_URL}
          value={baseUrl}
          onChange={handleBaseUrlChange}
          autoComplete="off"
        />
        <div className="modal-setting-hint">
          Адрес Ollama-сервера, доступный <b>с backend</b> (не из браузера).
          Локально — {OLLAMA_DEFAULT_URL}; в k3s — http://camera-cleaner-ollama:11434
        </div>
      </div>

      {/* Model */}
      <div className="modal-section">
        <div className="modal-section-title">Model</div>
        <input
          type="text"
          className="modal-text-input"
          placeholder={OLLAMA_DEFAULT_MODEL}
          value={model}
          onChange={handleModelChange}
          list="ollama-installed-models"
          autoComplete="off"
        />
        <datalist id="ollama-installed-models">
          {installed.map(m => <option key={m} value={m} />)}
        </datalist>
        <div className="modal-setting-hint">
          Мультимодальная (vision) модель, напр. gemma3:4b. Стоимость анализа = $0.
        </div>
      </div>

      {/* Model management */}
      <div className="modal-section">
        <div className="modal-section-title">Управление моделями</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button className="modal-btn" onClick={refreshModels} disabled={busy}>
            <i className="mdi mdi-refresh" /> Обновить список
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            className="modal-text-input"
            placeholder="gemma3:4b — имя для установки"
            value={pullName}
            onChange={e => setPullName(e.target.value)}
            autoComplete="off"
          />
          <button className="modal-btn" onClick={handlePull} disabled={busy || !pullName.trim()}>
            <i className="mdi mdi-download" /> Установить
          </button>
        </div>
        {installed.length > 0 && (
          <div className="modal-setting-hint">
            Установлены: {installed.join(', ')}
          </div>
        )}
        {status && <div className="modal-setting-hint">{status}</div>}
      </div>
    </>
  )
}
