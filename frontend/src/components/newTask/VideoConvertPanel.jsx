import { VC_CODECS, VC_PRESETS } from './newTaskHelpers.js'
import MtimeFilterSection from './MtimeFilterSection.jsx'
import DryRunSection from './DryRunSection.jsx'

// Parameter panel for the video_convert task type.
// `vc` is the params object owned by NewTaskModal; `patch` merges partial updates.
export default function VideoConvertPanel({ vc, patch, datesFromCamera, onDatesEdited,
                                            countLoading, count }) {
  return (
    <>
      <div className="ntm__section ntm__params-grid">
        <div className="ntm__param">
          <label className="ntm__label">Input pattern</label>
          <input type="text" className="modal-text-input" value={vc.inputPattern}
            onChange={e => patch({ inputPattern: e.target.value })}
            placeholder="*.mp4" />
          <div className="ntm__param-hint">Glob: *.mp4, *.mkv, *.avi</div>
        </div>
        <div className="ntm__param">
          <label className="ntm__label">Output file suffix</label>
          <input type="text" className="modal-text-input" value={vc.outputSuffix}
            onChange={e => patch({ outputSuffix: e.target.value })}
            placeholder="_web" />
          <div className="ntm__param-hint">Appended to the file name</div>
        </div>
        <div className="ntm__param">
          <label className="ntm__label">Output file extension</label>
          <input type="text" className="modal-text-input" value={vc.outputExtension}
            onChange={e => patch({ outputExtension: e.target.value })}
            placeholder="mp4" />
        </div>
        <div className="ntm__param">
          <label className="ntm__label">Codec</label>
          <select className="modal-select" value={vc.codec} onChange={e => patch({ codec: e.target.value })}>
            {VC_CODECS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="ntm__param">
          <label className="ntm__label">CRF (quality, 18–51)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="range" min="18" max="51" step="1" value={vc.crf}
              onChange={e => patch({ crf: +e.target.value })}
              style={{ flex: 1, accentColor: 'var(--accent)' }} />
            <span style={{ minWidth: 24, fontWeight: 600 }}>{vc.crf}</span>
          </div>
          <div className="ntm__param-hint">Lower = better quality, bigger file</div>
        </div>
        <div className="ntm__param">
          <label className="ntm__label">Preset (encoding speed)</label>
          <select className="modal-select" value={vc.preset} onChange={e => patch({ preset: e.target.value })}>
            {VC_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <MtimeFilterSection
        dateFrom={vc.dateFrom} dateTo={vc.dateTo}
        onDateFrom={v => { patch({ dateFrom: v }); onDatesEdited() }}
        onDateTo={v => { patch({ dateTo: v }); onDatesEdited() }}
        autoFilled={datesFromCamera}
        countLoading={countLoading} count={count}
        foundLabel="videos match the filter"
        emptyLabel="No videos match the filter"
      />

      <div className="ntm__section ntm__example-row">
        <i className="mdi mdi-information-outline" style={{ color: 'var(--accent)' }} />
        <span>
          Example: <code>{vc.inputPattern || '*.mp4'}</code> →{' '}
          <code>{'<basename>'}{vc.outputSuffix || '_web'}.{vc.outputExtension || 'mp4'}</code>
          &nbsp;· Converted into the same folder
        </span>
      </div>

      <DryRunSection checked={vc.dryRun} onChange={v => patch({ dryRun: v })}
        onText="Log only — files are not modified." offText="Real file conversion." />
    </>
  )
}
