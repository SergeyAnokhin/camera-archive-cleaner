// Reusable labelled range-slider row used across the Tools tabs.
export default function SliderSetting({
  title, min, max, step = 1, value, onChange,
  minLabel, maxLabel, maxLabelClass = '', valueLabel, hint,
}) {
  return (
    <div className="modal-section">
      <div className="modal-section-title">{title}</div>
      <div className="font-slider-row">
        <span className="font-size-label">{minLabel ?? min}</span>
        <input type="range" min={min} max={max} step={step}
          value={value} onChange={onChange} className="font-slider" />
        <span className={`font-size-label ${maxLabelClass}`.trim()}>{maxLabel ?? max}</span>
        <span className="font-size-value">{valueLabel}</span>
      </div>
      {hint && <div className="modal-setting-hint">{hint}</div>}
    </div>
  )
}
