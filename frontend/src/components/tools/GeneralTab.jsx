import { useState, useRef } from 'react'
import * as yaml from 'js-yaml'
import SliderSetting from './SliderSetting.jsx'
import { exportSettingsYaml, applyImportedSettings, applyFontSize } from './settingsIO.js'
import {
  FONT_KEY, FONT_MIN, FONT_MAX, FONT_DEFAULT,
  PREVIEWS_PER_CELL_KEY, PREVIEWS_PER_CELL_MIN, PREVIEWS_PER_CELL_MAX, PREVIEWS_PER_CELL_DEFAULT,
  ETA_WINDOW_KEY, ETA_WINDOW_MIN, ETA_WINDOW_MAX, ETA_WINDOW_DEFAULT,
  LOG_TAIL_KEY, LOG_TAIL_MIN, LOG_TAIL_MAX, LOG_TAIL_DEFAULT,
} from './settingsConfig.js'

export default function GeneralTab() {
  const [fontSize, setFontSize] = useState(() => Number(localStorage.getItem(FONT_KEY)) || FONT_DEFAULT)
  const [previewsPerCell, setPreviewsPerCell] = useState(() => {
    const v = localStorage.getItem(PREVIEWS_PER_CELL_KEY)
    return v !== null ? Number(v) : PREVIEWS_PER_CELL_DEFAULT
  })
  const [etaWindow, setEtaWindow] = useState(() =>
    Number(localStorage.getItem(ETA_WINDOW_KEY)) || ETA_WINDOW_DEFAULT
  )
  const [logTailLines, setLogTailLines] = useState(() =>
    Number(localStorage.getItem(LOG_TAIL_KEY)) || LOG_TAIL_DEFAULT
  )
  const [importResult, setImportResult] = useState(null)
  const importRef = useRef(null)

  function handleFontChange(e) {
    const px = Number(e.target.value)
    setFontSize(px)
    applyFontSize(px)
    localStorage.setItem(FONT_KEY, px)
    document.dispatchEvent(new CustomEvent('font-base-change', { detail: px }))
  }

  function handlePreviewsPerCellChange(e) {
    const v = Number(e.target.value)
    setPreviewsPerCell(v)
    localStorage.setItem(PREVIEWS_PER_CELL_KEY, v)
    document.dispatchEvent(new CustomEvent('previews-per-cell-change', { detail: v }))
  }

  function handleEtaWindowChange(e) {
    const v = Number(e.target.value)
    setEtaWindow(v)
    localStorage.setItem(ETA_WINDOW_KEY, v)
  }

  function handleLogTailChange(e) {
    const v = Number(e.target.value)
    setLogTailLines(v)
    localStorage.setItem(LOG_TAIL_KEY, v)
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
        // re-sync this tab's own controls — other tabs re-read on remount
        setFontSize(Number(localStorage.getItem(FONT_KEY)) || FONT_DEFAULT)
        const ppc = localStorage.getItem(PREVIEWS_PER_CELL_KEY)
        setPreviewsPerCell(ppc !== null ? Number(ppc) : PREVIEWS_PER_CELL_DEFAULT)
        setEtaWindow(Number(localStorage.getItem(ETA_WINDOW_KEY)) || ETA_WINDOW_DEFAULT)
        setLogTailLines(Number(localStorage.getItem(LOG_TAIL_KEY)) || LOG_TAIL_DEFAULT)
      } catch (err) {
        setImportResult({ ok: false, text: `Parse error: ${err.message}` })
      }
    }
    reader.readAsText(file)
  }

  return (
    <>
      <SliderSetting
        title="Font size"
        min={FONT_MIN} max={FONT_MAX} step={1}
        value={fontSize} onChange={handleFontChange}
        minLabel="A" maxLabel="A" maxLabelClass="large"
        valueLabel={`${fontSize} px`}
      />

      <SliderSetting
        title="Preview thumbnails per cell"
        min={PREVIEWS_PER_CELL_MIN} max={PREVIEWS_PER_CELL_MAX} step={1}
        value={previewsPerCell} onChange={handlePreviewsPerCellChange}
        minLabel="0" maxLabel={String(PREVIEWS_PER_CELL_MAX)}
        valueLabel={previewsPerCell}
        hint="Thumbnails shown inside each heatmap cell (year/month/day). Set 0 to disable."
      />

      <SliderSetting
        title="ETA window (минуты)"
        min={ETA_WINDOW_MIN} max={ETA_WINDOW_MAX} step={1}
        value={etaWindow} onChange={handleEtaWindowChange}
        minLabel={String(ETA_WINDOW_MIN)} maxLabel={String(ETA_WINDOW_MAX)}
        valueLabel={`${etaWindow} мин`}
        hint="Скорость обработки и ETA рассчитываются по последним N минутам, а не с начала задачи."
      />

      <SliderSetting
        title="Строк в логе задачи"
        min={LOG_TAIL_MIN} max={LOG_TAIL_MAX} step={5}
        value={logTailLines} onChange={handleLogTailChange}
        minLabel={String(LOG_TAIL_MIN)} maxLabel={String(LOG_TAIL_MAX)}
        valueLabel={`${logTailLines} строк`}
        hint="Сколько последних строк показывать в окне «Посмотреть логи». Уменьшите, если браузер подвисает при открытии."
      />

      {/* Export / Import */}
      <div className="modal-section">
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
    </>
  )
}
