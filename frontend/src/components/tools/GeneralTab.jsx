import { useState, useRef } from 'react'
import * as yaml from 'js-yaml'
import SliderSetting from './SliderSetting.jsx'
import { exportSettingsYaml, applyImportedSettings, applyFontSize, collectSettings } from './settingsIO.js'
import { saveSettings } from '../../api.js'
import {
  FONT_KEY, FONT_MIN, FONT_MAX, FONT_DEFAULT,
} from './settingsConfig.js'

export default function GeneralTab() {
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem(FONT_KEY)) || FONT_DEFAULT)
  const [importResult, setImportResult] = useState(null)
  const importRef = useRef(null)

  function handleFontChange(e) {
    const px = Number(e.target.value)
    setFontSize(px)
    applyFontSize(px)
    localStorage.setItem(FONT_KEY, px)
    document.dispatchEvent(new CustomEvent('font-base-change', { detail: px }))
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = yaml.load(ev.target.result)
        const n = applyImportedSettings(data)
        setImportResult({ ok: true, text: `Imported ${n} settings.` })
        setFontSize(Number(localStorage.getItem(FONT_KEY)) || FONT_DEFAULT)
        // Sync imported settings to the server
        const settings = collectSettings()
        saveSettings(settings).catch(err => console.error("Failed to sync settings to server:", err))
      } catch (err) {
        setImportResult({ ok: false, text: `Parse error: ${err.message}` })
      }
    }
    reader.readAsText(file)
  }

  return (
    <div className="modal-2col">
      <SliderSetting
        title="Font size"
        min={FONT_MIN} max={FONT_MAX} step={1}
        value={fontSize} onChange={handleFontChange}
        minLabel="A" maxLabel="A" maxLabelClass="large"
        valueLabel={`${fontSize} px`}
      />

      <div className="modal-section col-span-2">
        <div className="modal-section-title">Settings file</div>
        <div className="modal-action-row">
          <button className="modal-btn neutral" onClick={exportSettingsYaml}>
            <i className="mdi mdi-download-outline" /> Export YAML
          </button>
          <button className="modal-btn neutral" onClick={() => { setImportResult(null); importRef.current?.click() }}>
            <i className="mdi mdi-upload-outline" /> Import YAML
          </button>
          <input ref={importRef} type="file" accept=".yaml,.yml" style={{ display: 'none' }} onChange={handleImportFile} />
        </div>
        <div className="modal-setting-hint">Export saves all settings to <code>snapshots-settings.yaml</code>. Import applies only recognised keys — unknown or invalid values are silently skipped.</div>
        {importResult && (
          <div className={`modal-result ${importResult.ok ? 'ok' : 'err'}`}>{importResult.text}</div>
        )}
      </div>
    </div>
  )
}
