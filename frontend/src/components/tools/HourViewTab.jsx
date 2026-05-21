import { useState } from 'react'
import SliderSetting from './SliderSetting.jsx'
import {
  PAGE_SIZE_KEY, PAGE_SIZE_MIN, PAGE_SIZE_MAX, PAGE_SIZE_DEFAULT,
  ZOOM_KEY, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, ZOOM_DEFAULT,
  THUMB_WIDTH_KEY, THUMB_WIDTH_MIN, THUMB_WIDTH_MAX, THUMB_WIDTH_DEFAULT,
  DIFF_THRESHOLD_KEY, DIFF_THRESHOLD_MIN, DIFF_THRESHOLD_MAX, DIFF_THRESHOLD_DEFAULT,
  VIDEO_PREVIEW_KEY, VIDEO_PREVIEW_DEFAULT, VIDEO_PREVIEW_OPTIONS,
  UNIFORMITY_METHOD_KEY, UNIFORMITY_METHOD_DEFAULT, U_METRICS, U_DEFAULTS,
} from './settingsConfig.js'

export default function HourViewTab() {
  const [pageSize, setPageSize] = useState(() => Number(localStorage.getItem(PAGE_SIZE_KEY)) || PAGE_SIZE_DEFAULT)
  const [hoverZoom, setHoverZoom] = useState(() => Number(localStorage.getItem(ZOOM_KEY)) || ZOOM_DEFAULT)
  const [thumbWidth, setThumbWidth] = useState(() => Number(localStorage.getItem(THUMB_WIDTH_KEY)) || THUMB_WIDTH_DEFAULT)
  const [diffThreshold, setDiffThreshold] = useState(() => {
    const v = localStorage.getItem(DIFF_THRESHOLD_KEY)
    return v !== null ? Number(v) : DIFF_THRESHOLD_DEFAULT
  })
  const [videoPreviewMode, setVideoPreviewMode] = useState(
    () => localStorage.getItem(VIDEO_PREVIEW_KEY) || VIDEO_PREVIEW_DEFAULT
  )
  const [uniformityThresholds, setUniformityThresholds] = useState(() => {
    const t = {}
    for (const { key } of U_METRICS) {
      const [dw, da] = U_DEFAULTS[key]
      t[key] = {
        warn:  Number(localStorage.getItem(`uniformity_${key}_warn`))  || dw,
        alert: Number(localStorage.getItem(`uniformity_${key}_alert`)) || da,
      }
    }
    return t
  })
  const [uniformityMethod, setUniformityMethod] = useState(
    () => localStorage.getItem(UNIFORMITY_METHOD_KEY) || UNIFORMITY_METHOD_DEFAULT
  )

  function handlePageSizeChange(e) {
    const raw = Number(e.target.value)
    const v = Math.max(PAGE_SIZE_MIN, Math.min(PAGE_SIZE_MAX, raw || PAGE_SIZE_DEFAULT))
    setPageSize(v)
    localStorage.setItem(PAGE_SIZE_KEY, v)
    document.dispatchEvent(new CustomEvent('hour-page-size-change', { detail: v }))
  }

  function handleThumbWidthChange(e) {
    const v = Number(e.target.value)
    setThumbWidth(v)
    localStorage.setItem(THUMB_WIDTH_KEY, v)
    document.dispatchEvent(new CustomEvent('thumb-width-change', { detail: v }))
  }

  function handleHoverZoomChange(e) {
    const v = Number(e.target.value)
    setHoverZoom(v)
    localStorage.setItem(ZOOM_KEY, v)
    document.dispatchEvent(new CustomEvent('hover-zoom-change', { detail: v }))
  }

  function handleDiffThresholdChange(e) {
    const v = Number(e.target.value)
    setDiffThreshold(v)
    localStorage.setItem(DIFF_THRESHOLD_KEY, v)
    document.dispatchEvent(new CustomEvent('diff-threshold-change', { detail: v }))
  }

  function handleVideoPreviewModeChange(e) {
    const v = e.target.value
    setVideoPreviewMode(v)
    localStorage.setItem(VIDEO_PREVIEW_KEY, v)
    document.dispatchEvent(new CustomEvent('video-preview-mode-change', { detail: v }))
  }

  function handleUniformityThreshold(metric, type, v) {
    setUniformityThresholds(prev => ({ ...prev, [metric]: { ...prev[metric], [type]: v } }))
    localStorage.setItem(`uniformity_${metric}_${type}`, v)
  }

  function handleUniformityMethodChange(e) {
    const v = e.target.value
    setUniformityMethod(v)
    localStorage.setItem(UNIFORMITY_METHOD_KEY, v)
    document.dispatchEvent(new CustomEvent('uniformity-method-change'))
  }

  return (
    <>
      {/* Photos per page */}
      <div className="modal-section">
        <div className="modal-section-title">Photos per page</div>
        <div className="font-slider-row">
          <input type="number" min={PAGE_SIZE_MIN} max={PAGE_SIZE_MAX} step="10"
            value={pageSize} onChange={handlePageSizeChange} className="modal-number-input" />
          <span className="font-size-value" style={{ marginLeft: 0 }}>per page</span>
        </div>
        <div className="modal-setting-hint">Number of items per page when browsing a specific hour ({PAGE_SIZE_MIN}–{PAGE_SIZE_MAX}).</div>
      </div>

      <SliderSetting
        title="Thumbnail width"
        min={THUMB_WIDTH_MIN} max={THUMB_WIDTH_MAX} step={10}
        value={thumbWidth} onChange={handleThumbWidthChange}
        valueLabel={`${thumbWidth} px`}
        hint="Minimum column width of photo cards."
      />

      <SliderSetting
        title="Hover zoom"
        min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP}
        value={hoverZoom} onChange={handleHoverZoomChange}
        minLabel="1×" maxLabel={`${ZOOM_MAX}×`}
        valueLabel={`${hoverZoom.toFixed(2)}×`}
        hint="Scale factor when hovering a photo. Set to 1× to disable."
      />

      <SliderSetting
        title="Motion diff — change threshold"
        min={DIFF_THRESHOLD_MIN} max={DIFF_THRESHOLD_MAX} step={1}
        value={diffThreshold} onChange={handleDiffThresholdChange}
        valueLabel={diffThreshold}
        hint="Pixels with a channel delta below this value are darkened in Motion diff mode. Higher = only significant changes shown."
      />

      {/* Video preview mode */}
      <div className="modal-section">
        <div className="modal-section-title">Превью видео</div>
        <select className="modal-select" value={videoPreviewMode} onChange={handleVideoPreviewModeChange}>
          {VIDEO_PREVIEW_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="modal-setting-hint">
          Режим отображения превью для видеофайлов на карточках. GIF генерируется дольше и кешируется.
        </div>
      </div>

      {/* Uniformity analysis */}
      <div className="modal-section">
        <div className="modal-section-title">Равномерность записи</div>
        <div className="u-grid">
          <div className="u-grid-head">
            <span />
            <span><i className="mdi mdi-alert-outline" style={{color:'#fbbf24'}} /> жёлтый</span>
            <span><i className="mdi mdi-alert-circle-outline" style={{color:'#f87171'}} /> красный</span>
          </div>
          {U_METRICS.map(({ key, label, desc }) => (
            <div key={key} className="u-grid-row" title={desc}>
              <span className="u-metric-label">{label}</span>
              <div className="u-slider-cell">
                <input type="range" min={5} max={95} step={5} className="u-slider"
                  value={uniformityThresholds[key].warn}
                  onChange={e => handleUniformityThreshold(key, 'warn', Number(e.target.value))} />
                <span className="u-val">{uniformityThresholds[key].warn}</span>
              </div>
              <div className="u-slider-cell">
                <input type="range" min={5} max={95} step={5} className="u-slider"
                  value={uniformityThresholds[key].alert}
                  onChange={e => handleUniformityThreshold(key, 'alert', Number(e.target.value))} />
                <span className="u-val">{uniformityThresholds[key].alert}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="u-method-row">
          <span className="u-method-label">Метод для ячеек дня:</span>
          <select className="u-method-select" value={uniformityMethod} onChange={handleUniformityMethodChange}>
            <option value="combined">∑ Комбинированный</option>
            <option value="active">AF — активных минут</option>
            <option value="entropy">SE — энтропия</option>
            <option value="bc">BC — блоки 5 мин</option>
          </select>
        </div>
        <div className="modal-setting-hint">0 = одно событие · 100 = запись весь час. Жёлтый — возможен ветер, красный — дождь/постоянные ложные срабатывания. На экране превьюшек видны все три метода.</div>
      </div>
    </>
  )
}
