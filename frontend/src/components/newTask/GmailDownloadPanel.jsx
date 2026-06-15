// Parameter panel for the gmail_download task type.
// `gm` is the params object owned by NewTaskModal; `patch` merges partial updates.
// `labels` — null while loading, [] / [{id,name}] when loaded; only when connected.
export default function GmailDownloadPanel({ gm, patch, labels, connected }) {
  return (
    <>
      <div className="ntm__section ntm__row">
        <label className="ntm__label">Gmail label</label>
        {!connected ? (
          <div className="ntm__param-hint">Connect a Google account to load labels</div>
        ) : labels === null ? (
          <div className="ntm__param-hint">
            <i className="mdi mdi-loading mdi-spin" style={{ marginRight: 4 }} />Loading labels…
          </div>
        ) : (
          <select className="modal-select ntm__select"
            value={gm.labelId} onChange={e => patch({ labelId: e.target.value })}>
            <option value="">Select label…</option>
            {labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        <div className="ntm__param-hint">
          Photo/video attachments from every email in this label are saved and indexed
        </div>
      </div>

      <div className="ntm__section ntm__row">
        <label className="ntm__label">Destination subfolder (optional)</label>
        <input type="text" className="modal-text-input" value={gm.outputFolder}
          onChange={e => patch({ outputFolder: e.target.value })}
          placeholder="empty = camera folder root" />
        <div className="ntm__param-hint">Created inside the camera directory</div>
      </div>

      <div className="ntm__section ntm__row">
        <label className="ntm__label">Object extraction regex (optional)</label>
        <input type="text" className="modal-text-input" value={gm.subjectObjectRegex}
          onChange={e => patch({ subjectObjectRegex: e.target.value })}
          placeholder="^(\w+)\s+Detected" />
        <div className="ntm__param-hint">
          Applied to the email subject — <strong>capture group 1</strong> becomes the detected object.
          Example: <code>^(\w+)\s+Detected</code> extracts <code>person</code> from
          &ldquo;Person Detected from camera at …&rdquo;
        </div>
      </div>

      <div className="ntm__section ntm__row">
        <label className="ntm__label">Organize by date</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={gm.organizeByDate}
            onChange={e => patch({ organizeByDate: e.target.checked })} />
          Place files in YYYY/MM/DD subfolders
        </label>
        <div className="ntm__param-hint">
          Date is parsed from the subject line
          (<code>at 2026/6/15 19:31:46</code> — Reolink format), falling back to email date
        </div>
      </div>

      <div className="ntm__section">
        <div className="ntm__date-header">
          <label className="ntm__label" style={{margin:0}}>Email date filter</label>
        </div>
        <div className="ntm__dates">
          <input type="datetime-local" className="modal-text-input ntm__date-input"
            value={gm.dateFrom} onChange={e => patch({ dateFrom: e.target.value })} />
          <span className="ntm__date-sep">→</span>
          <input type="datetime-local" className="modal-text-input ntm__date-input"
            value={gm.dateTo} onChange={e => patch({ dateTo: e.target.value })} />
        </div>
        <div className="ntm__param-hint" style={{ marginTop: 4 }}>
          Empty = all emails in the label
        </div>
      </div>

      <div className="ntm__section ntm__example-row">
        <i className="mdi mdi-information-outline" style={{ color: 'var(--accent)' }} />
        <span>
          Files are immediately indexed in the library. If the subject matches the Reolink
          alarm format (<em>Person Detected from camera at …</em>), the event type is
          also saved as a detected object — no scan or OpenVINO run needed.
        </span>
      </div>
    </>
  )
}
