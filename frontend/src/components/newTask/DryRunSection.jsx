// Dry-run toggle section, shared by VideoConvertPanel and FileOrganizerPanel.
export default function DryRunSection({ checked, onChange, onText, offText }) {
  return (
    <div className="ntm__section">
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
        <input type="checkbox" checked={checked}
          onChange={e => onChange(e.target.checked)}
          style={{ accentColor: '#f59e0b', width: 14, height: 14 }} />
        <span className="ntm__label" style={{ margin: 0, color: checked ? '#f59e0b' : undefined }}>
          Режим симуляции (dry run)
        </span>
      </label>
      <div style={{ fontSize: 'calc(var(--font-base) * 0.82)', color: 'var(--text-dim)', marginTop: 4, paddingLeft: 22 }}>
        {checked ? onText : offText}
      </div>
    </div>
  )
}
