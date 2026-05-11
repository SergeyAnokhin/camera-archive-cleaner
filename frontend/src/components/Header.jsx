import './Header.css'

function StatChip({ icon, value, label }) {
  return (
    <div className="stat-chip">
      <i className={`mdi ${icon}`} />
      <span className="stat-chip-value">{value}</span>
      <span className="stat-chip-label">{label}</span>
    </div>
  )
}

export default function Header({ totals }) {
  return (
    <header className="header">
      <div className="header-brand">
        <i className="mdi mdi-cctv" />
        <span>Camera Archive</span>
      </div>
      <div className="header-stats">
        {totals ? (
          <>
            <StatChip icon="mdi-database" value={`${totals.total_size_gb.toFixed(2)} GB`} label="total" />
            <StatChip icon="mdi-camera" value={totals.photo_count.toLocaleString()} label="photos" />
            <StatChip icon="mdi-video" value={totals.video_count.toLocaleString()} label="videos" />
          </>
        ) : (
          <>
            <div className="stat-chip skeleton stat-chip-skeleton" />
            <div className="stat-chip skeleton stat-chip-skeleton" />
            <div className="stat-chip skeleton stat-chip-skeleton" />
          </>
        )}
      </div>
    </header>
  )
}
