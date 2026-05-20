// Slider panel for non-AI view modes that expose tunable params (e.g. motion threshold).
export default function ModeSettingsPanel({ mode, params, onChange }) {
  if (!mode.params?.length) return null
  return (
    <div className="hv-mode-settings">
      <span className="hv-mode-settings-label">{mode.label}</span>
      {mode.params.map(p => (
        <div key={p.key} className="hv-mode-param">
          <span className="hv-mode-param-name">{p.label}</span>
          <input
            type="range"
            min={p.min} max={p.max} step={p.step}
            value={params[p.key] ?? p.default}
            onChange={e => onChange(p.key, Number(e.target.value))}
            className="hv-mode-param-slider"
          />
          <span className="hv-mode-param-value">{params[p.key] ?? p.default}</span>
        </div>
      ))}
    </div>
  )
}
