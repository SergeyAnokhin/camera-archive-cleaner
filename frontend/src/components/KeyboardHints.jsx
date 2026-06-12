// Footer strip of keyboard shortcuts shown under the heatmap.
export default function KeyboardHints({ hints }) {
  if (!hints.length) return null
  return (
    <div className="kb-hints" style={{
      padding: '4px 16px 6px',
      fontSize: 'calc(var(--font-base) * 0.75)',
      color: 'var(--text-dim)',
      textAlign: 'center',
      userSelect: 'none',
      marginTop: 'var(--gap-md)',
    }}>
      {hints.map((h, i) => (
        <span key={i}>
          {i > 0 && <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>}
          <kbd style={{
            background: '#1f2937', border: '1px solid #374151',
            borderRadius: '3px', padding: '0px 4px', fontSize: 'inherit',
            fontFamily: 'inherit', marginRight: 4,
          }}>{h.key}</kbd>
          {h.label}
        </span>
      ))}
    </div>
  )
}
