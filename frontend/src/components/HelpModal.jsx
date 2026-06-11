import { useEffect } from 'react'
import './HelpModal.css'

export default function HelpModal({ onClose }) {
  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="help-modal-card">
        <div className="modal-header">
          <span><i className="mdi mdi-help-circle-outline" /> Руководство пользователя</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="help-modal-body">
          {/* Typial Scenario Section */}
          <div className="help-section">
            <h3 className="help-section-title"><i className="mdi mdi-play-circle-outline" /> Типовой сценарий очистки архива</h3>
            <div className="scenario-flow">
              <div className="scenario-step">
                <div className="step-num">1</div>
                <div className="step-content">
                  <strong>Сканирование (Scan)</strong>
                  <p>Нажмите <code>Scan</code> в правом верхнем углу, чтобы проиндексировать новые файлы с камеры в базу данных.</p>
                </div>
              </div>
              <div className="scenario-step-arrow"><i className="mdi mdi-chevron-down" /></div>

              <div className="scenario-step">
                <div className="step-num">2</div>
                <div className="step-content">
                  <strong>Тепловая карта (Heatmap)</strong>
                  <p>Проанализируйте распределение данных на сетке. Перейдите по уровням (Год → Месяц → День → Час), кликая по ячейкам, чтобы найти всплески активности.</p>
                </div>
              </div>
              <div className="scenario-step-arrow"><i className="mdi mdi-chevron-down" /></div>

              <div className="scenario-step">
                <div className="step-num">3</div>
                <div className="step-content">
                  <strong>Просмотр часа (Hour Viewer)</strong>
                  <p>Кликните по ячейке часа. Вы перейдёте на страницу детального просмотра снимков и видеозаписей за выбранный час.</p>
                </div>
              </div>
              <div className="scenario-step-arrow"><i className="mdi mdi-chevron-down" /></div>

              <div className="scenario-step">
                <div className="step-num">4</div>
                <div className="step-content">
                  <strong>Режим движения (View Mode)</strong>
                  <p>Переключите режим просмотра вверху с <code>Normal</code> на <code>Motion highlight</code> или <code>Erosion</code>. Это скроет статичный фон и подсветит изменения.</p>
                </div>
              </div>
              <div className="scenario-step-arrow"><i className="mdi mdi-chevron-down" /></div>

              <div className="scenario-step">
                <div className="step-num">5</div>
                <div className="step-content">
                  <strong>Выделение (Selection)</strong>
                  <p>Нажмите <code>Select</code> (или зажмите <code>Shift</code> и кликайте) для выделения группы файлов. Можно нажать <code>Select All</code> в панели.</p>
                </div>
              </div>
              <div className="scenario-step-arrow"><i className="mdi mdi-chevron-down" /></div>

              <div className="scenario-step-danger">
                <div className="step-num-danger"><i className="mdi mdi-trash-can-outline" /></div>
                <div className="step-content">
                  <strong>Удаление (Safe Delete)</strong>
                  <p>Нажмите <code>Delete</code> в появившейся панели снизу, просмотрите превью файлов во всплывающем окне и подтвердите безопасное удаление с диска.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Hotkeys Section */}
          <div className="help-section">
            <h3 className="help-section-title"><i className="mdi mdi-keyboard-outline" /> Быстрые клавиши (Горячие клавиши)</h3>
            <div className="hotkeys-grid">
              <div className="hotkey-row">
                <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd>
                <span>Навигация по сетке теплокарты / списку файлов</span>
              </div>
              <div className="hotkey-row">
                <kbd>Enter</kbd>
                <span>Провалиться внутрь ячейки теплокарты / Открыть оригинал</span>
              </div>
              <div className="hotkey-row">
                <kbd>Esc</kbd> / <kbd>Backspace ⌫</kbd>
                <span>Вернуться на уровень выше (назад)</span>
              </div>
              <div className="hotkey-row">
                <kbd>Space</kbd>
                <span>Выделить текущую ячейку / файл в списке</span>
              </div>
              <div className="hotkey-row">
                <kbd>Ctrl</kbd> + <kbd>A</kbd>
                <span>Выделить все ячейки / файлы</span>
              </div>
              <div className="hotkey-row">
                <kbd>Delete ⌦</kbd>
                <span>Удалить выделенное</span>
              </div>
            </div>
          </div>

          {/* Uniformity Section */}
          <div className="help-section">
            <h3 className="help-section-title"><i className="mdi mdi-chart-bell-curve" /> Индикаторы равномерности (Ложные тревоги)</h3>
            <p className="help-text">
              Приложение вычисляет равномерность распределения файлов внутри часа для выявления ложных тревог (например, из-за ветра, дождя или паутины):
            </p>
            <div className="uniformity-info-grid">
              <div className="uniformity-card af">
                <span className="badge-name">AF (Active Fraction)</span>
                <span className="badge-desc">Какую долю часа (в минутах) занимала запись. 100% — запись велась каждую минуту.</span>
              </div>
              <div className="uniformity-card se">
                <span className="badge-name">SE (Shannon Entropy)</span>
                <span className="badge-desc">Насколько равномерно распределён объём файлов по минутам. Показывает хаотичность.</span>
              </div>
              <div className="uniformity-card bc">
                <span className="badge-name">BC (Block Coverage)</span>
                <span className="badge-desc">Какое количество 5-минутных интервалов часа содержат хотя бы одну запись.</span>
              </div>
            </div>
            <div className="modal-setting-hint" style={{ marginTop: 10 }}>
              <i className="mdi mdi-information-outline" style={{ marginRight: 4 }} />
              Жёлтый или красный цвет баджа на сетке означает высокую равномерность (подозрение на циклическую ложную тревогу). Зелёный цвет означает редкие, точечные события.
            </div>
          </div>
        </div>

        <div className="help-modal-footer">
          <button className="modal-btn" onClick={onClose}>Понятно</button>
        </div>
      </div>
    </div>
  )
}
