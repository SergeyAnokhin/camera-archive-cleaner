// Date-filter (mtime) section + live file-count estimate.
// Shared by VideoConvertPanel and FileOrganizerPanel.
export default function MtimeFilterSection({
  dateFrom, dateTo, onDateFrom, onDateTo, autoFilled,
  countLoading, count, foundLabel, emptyLabel,
}) {
  return (
    <div className="ntm__section">
      <div className="ntm__date-header">
        <label className="ntm__label" style={{margin:0}}>File-date filter (mtime)</label>
        {autoFilled && (
          <span className="ntm__date-hint">
            <i className="mdi mdi-check-circle" style={{fontSize:12,marginRight:3}} />
            auto-filled
          </span>
        )}
      </div>
      <div className="ntm__dates">
        <input type="datetime-local" className="modal-text-input ntm__date-input"
          value={dateFrom} onChange={e => onDateFrom(e.target.value)} />
        <span className="ntm__date-sep">→</span>
        <input type="datetime-local" className="modal-text-input ntm__date-input"
          value={dateTo} onChange={e => onDateTo(e.target.value)} />
      </div>
      <div className="ntm__param-hint" style={{ marginTop: 4 }}>
        Empty = process all files without a date filter
      </div>
      {countLoading ? (
        <div style={{ marginTop: 6, color: 'var(--text-dim)', fontSize: 'calc(var(--font-base)*0.85)' }}>
          <i className="mdi mdi-loading mdi-spin" style={{ marginRight: 4 }} />Counting files…
        </div>
      ) : count != null ? (
        count > 0 ? (
          <div className="ntm__estimate" style={{ marginTop: 6 }}>
            <i className="mdi mdi-information-outline" />
            <strong>{count.toLocaleString()}</strong>&nbsp;{foundLabel}
          </div>
        ) : (
          <div className="ntm__warn" style={{ marginTop: 6 }}>
            <i className="mdi mdi-alert-outline" /> {emptyLabel}
          </div>
        )
      ) : null}
    </div>
  )
}
