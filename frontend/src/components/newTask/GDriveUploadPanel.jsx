// Parameter panel for the gdrive_upload task type.
// `gd` is the params object owned by NewTaskModal; `patch` merges partial updates.
// `estimate` — {photos, videos} counts for the chosen date range, or null.
const FILE_TYPES = [
  { value: 'photo', icon: 'mdi-camera',        label: 'Photos' },
  { value: 'video', icon: 'mdi-video-outline', label: 'Videos' },
  { value: 'both',  icon: 'mdi-image-multiple-outline', label: 'Photos + videos' },
]

export default function GDriveUploadPanel({ gd, patch, datesFromCamera, onDatesEdited, estimate }) {
  const count = estimate == null ? null
    : gd.fileType === 'photo' ? estimate.photos
    : gd.fileType === 'video' ? estimate.videos
    : estimate.photos + estimate.videos

  return (
    <>
      <div className="ntm__section ntm__row">
        <label className="ntm__label">What to upload</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {FILE_TYPES.map(t => (
            <button key={t.value}
              className={`ntm__toggle-btn${gd.fileType === t.value ? ' ntm__toggle-btn--active' : ''}`}
              onClick={() => patch({ fileType: t.value })}>
              <i className={`mdi ${t.icon}`} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ntm__section ntm__row">
        <label className="ntm__label">Google Drive folder</label>
        <input type="text" className="modal-text-input" value={gd.driveFolder}
          onChange={e => patch({ driveFolder: e.target.value })}
          placeholder="CameraCleaner/Front" />
        <div className="ntm__param-hint">
          Path under My Drive — missing folders are created automatically
        </div>
      </div>

      <div className="ntm__section">
        <div className="ntm__date-header">
          <label className="ntm__label" style={{margin:0}}>Date range</label>
          {datesFromCamera && (
            <span className="ntm__date-hint">
              <i className="mdi mdi-check-circle" style={{fontSize:12,marginRight:3}} />
              auto-filled from camera data
            </span>
          )}
        </div>
        <div className="ntm__dates">
          <input type="datetime-local" className="modal-text-input ntm__date-input"
            value={gd.dateFrom} onChange={e => { patch({ dateFrom: e.target.value }); onDatesEdited() }} />
          <span className="ntm__date-sep">→</span>
          <input type="datetime-local" className="modal-text-input ntm__date-input"
            value={gd.dateTo} onChange={e => { patch({ dateTo: e.target.value }); onDatesEdited() }} />
        </div>
      </div>

      {count != null && count > 0 && (
        <div className="ntm__estimate">
          <i className="mdi mdi-information-outline" />
          <strong>{count.toLocaleString()}</strong>&nbsp;files in this range
        </div>
      )}
      {count === 0 && (
        <div className="ntm__warn">
          <i className="mdi mdi-alert-outline" /> No files found in this range
        </div>
      )}

      <div className="ntm__section ntm__example-row">
        <i className="mdi mdi-information-outline" style={{ color: 'var(--accent)' }} />
        <span>
          Files already in the Drive folder are skipped — re-run the task anytime
          to upload only the new files
        </span>
      </div>
    </>
  )
}
