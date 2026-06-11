import MtimeFilterSection from './MtimeFilterSection.jsx'
import DryRunSection from './DryRunSection.jsx'

// Parameter panel for the file_organizer task type.
// `fo` is the params object owned by NewTaskModal; `patch` merges partial updates.
export default function FileOrganizerPanel({ fo, patch, datesFromCamera, onDatesEdited,
                                             countLoading, count }) {
  return (
    <>
      <div className="ntm__section ntm__row">
        <label className="ntm__label">Source</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {['snapshots', 'videos'].map(s => (
            <button key={s}
              className={`ntm__toggle-btn${fo.sourceType === s ? ' ntm__toggle-btn--active' : ''}`}
              onClick={() => patch({ sourceType: s })}>
              <i className={`mdi ${s === 'snapshots' ? 'mdi-camera' : 'mdi-video-outline'}`} />
              {s === 'snapshots' ? 'Photos (snapshots)' : 'Videos (videos)'}
            </button>
          ))}
        </div>
      </div>

      <div className="ntm__section ntm__params-grid">
        <div className="ntm__param">
          <label className="ntm__label">File pattern</label>
          <input type="text" className="modal-text-input" value={fo.inputPattern}
            onChange={e => patch({ inputPattern: e.target.value })}
            placeholder="*.jpg" />
          <div className="ntm__param-hint">Glob: *.jpg, *.mp4, *.*</div>
        </div>
        <div className="ntm__param">
          <label className="ntm__label">Destination folder</label>
          <input type="text" className="modal-text-input" value={fo.outputFolder}
            onChange={e => patch({ outputFolder: e.target.value })}
            placeholder="organized" />
          <div className="ntm__param-hint">Created inside the camera directory</div>
        </div>
        <div className="ntm__param ntm__param--wide">
          <label className="ntm__label">Regex for the date in the file name</label>
          <input type="text" className="modal-text-input" value={fo.dateRegex}
            onChange={e => patch({ dateRegex: e.target.value })}
            placeholder="(\d{4})(\d{2})(\d{2})" style={{ fontFamily: 'monospace' }} />
          <div className="ntm__param-hint">Groups 1–3: year, month, day</div>
        </div>
      </div>

      <div className="ntm__section ntm__example-row">
        <i className="mdi mdi-information-outline" style={{ color: 'var(--accent)' }} />
        <span>
          Files from the folder root → <code>{fo.outputFolder || 'organized'}/YYYY/MM/DD/</code>
          &nbsp;· Already-moved files are skipped
        </span>
      </div>

      <MtimeFilterSection
        dateFrom={fo.dateFrom} dateTo={fo.dateTo}
        onDateFrom={v => { patch({ dateFrom: v }); onDatesEdited() }}
        onDateTo={v => { patch({ dateTo: v }); onDatesEdited() }}
        autoFilled={datesFromCamera}
        countLoading={countLoading} count={count}
        foundLabel="files match the filter"
        emptyLabel="No files match the filter"
      />

      <DryRunSection checked={fo.dryRun} onChange={v => patch({ dryRun: v })}
        onText="Log only — files are not moved." offText="Real file moves." />
    </>
  )
}
