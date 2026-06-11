import MtimeFilterSection from './MtimeFilterSection.jsx'
import DryRunSection from './DryRunSection.jsx'

// Parameter panel for the file_organizer task type.
// `fo` is the params object owned by NewTaskModal; `patch` merges partial updates.
export default function FileOrganizerPanel({ fo, patch, datesFromCamera, onDatesEdited,
                                             countLoading, count }) {
  return (
    <>
      <div className="ntm__section ntm__row">
        <label className="ntm__label">Источник</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {['snapshots', 'videos'].map(s => (
            <button key={s}
              className={`ntm__toggle-btn${fo.sourceType === s ? ' ntm__toggle-btn--active' : ''}`}
              onClick={() => patch({ sourceType: s })}>
              <i className={`mdi ${s === 'snapshots' ? 'mdi-camera' : 'mdi-video-outline'}`} />
              {s === 'snapshots' ? 'Фото (snapshots)' : 'Видео (videos)'}
            </button>
          ))}
        </div>
      </div>

      <div className="ntm__section ntm__params-grid">
        <div className="ntm__param">
          <label className="ntm__label">Паттерн файлов</label>
          <input type="text" className="modal-text-input" value={fo.inputPattern}
            onChange={e => patch({ inputPattern: e.target.value })}
            placeholder="*.jpg" />
          <div className="ntm__param-hint">Glob: *.jpg, *.mp4, *.*</div>
        </div>
        <div className="ntm__param">
          <label className="ntm__label">Папка назначения</label>
          <input type="text" className="modal-text-input" value={fo.outputFolder}
            onChange={e => patch({ outputFolder: e.target.value })}
            placeholder="organized" />
          <div className="ntm__param-hint">Создаётся внутри директории камеры</div>
        </div>
        <div className="ntm__param ntm__param--wide">
          <label className="ntm__label">Regex для даты в имени файла</label>
          <input type="text" className="modal-text-input" value={fo.dateRegex}
            onChange={e => patch({ dateRegex: e.target.value })}
            placeholder="(\d{4})(\d{2})(\d{2})" style={{ fontFamily: 'monospace' }} />
          <div className="ntm__param-hint">Группы 1–3: год, месяц, день</div>
        </div>
      </div>

      <div className="ntm__section ntm__example-row">
        <i className="mdi mdi-information-outline" style={{ color: 'var(--accent)' }} />
        <span>
          Файлы из корня папки → <code>{fo.outputFolder || 'organized'}/ГГГГ/ММ/ДД/</code>
          &nbsp;· Уже перемещённые пропускаются
        </span>
      </div>

      <MtimeFilterSection
        dateFrom={fo.dateFrom} dateTo={fo.dateTo}
        onDateFrom={v => { patch({ dateFrom: v }); onDatesEdited() }}
        onDateTo={v => { patch({ dateTo: v }); onDatesEdited() }}
        autoFilled={datesFromCamera}
        countLoading={countLoading} count={count}
        foundLabel="файл(ов) подходит под фильтр"
        emptyLabel="Файлов по фильтру не найдено"
      />

      <DryRunSection checked={fo.dryRun} onChange={v => patch({ dryRun: v })}
        onText="Только лог — файлы не перемещаются." offText="Реальное перемещение файлов." />
    </>
  )
}
