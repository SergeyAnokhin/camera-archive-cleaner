import './DrilldownBreadcrumb.css'

const LEVEL_LABELS = { year: 'Years', month: 'Months', day: 'Days', hour: 'Hours' }

export default function DrilldownBreadcrumb({ drillStack, currentLevel, onNavigate, extraLabel }) {
  const segments = [{ label: 'All Years', index: -1 }, ...drillStack.map((entry, i) => ({ label: entry.label, index: i }))]

  return (
    <div className="breadcrumb">
      {segments.map((seg, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <span className="breadcrumb-sep">/</span>}
          {!extraLabel && i === segments.length - 1 ? (
            <span className="breadcrumb-current">{seg.label}</span>
          ) : (
            <button className="breadcrumb-link" onClick={() => onNavigate(seg.index)}>
              {seg.label}
            </button>
          )}
        </span>
      ))}
      {extraLabel && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">{extraLabel}</span>
        </span>
      )}
      <span className="breadcrumb-level-badge">{LEVEL_LABELS[currentLevel]}</span>
    </div>
  )
}
