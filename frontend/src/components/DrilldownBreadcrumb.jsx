import './DrilldownBreadcrumb.css'

const LEVEL_LABELS = { year: 'Years', month: 'Months', day: 'Days', hour: 'Hours' }

export default function DrilldownBreadcrumb({ drillStack, currentLevel, onNavigate }) {
  const segments = [{ label: 'All Years', index: -1 }, ...drillStack.map((entry, i) => ({ label: entry.label, index: i }))]
  const lastIdx = segments.length - 1

  return (
    <div className="breadcrumb">
      {segments.map((seg, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <span className="breadcrumb-sep">/</span>}
          {i < lastIdx ? (
            <button className="breadcrumb-link" onClick={() => onNavigate(seg.index)}>
              {seg.label}
            </button>
          ) : (
            <span className="breadcrumb-current">{seg.label}</span>
          )}
        </span>
      ))}
      <span className="breadcrumb-level-badge">{LEVEL_LABELS[currentLevel]}</span>
    </div>
  )
}
