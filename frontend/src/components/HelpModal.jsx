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
          <span><i className="mdi mdi-help-circle-outline" /> User Guide</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="help-modal-body">
          {/* Typical Scenario Section */}
          <div className="help-section">
            <h3 className="help-section-title"><i className="mdi mdi-play-circle-outline" /> Typical archive cleanup workflow</h3>
            <div className="scenario-flow">
              <div className="scenario-step">
                <div className="step-num">1</div>
                <div className="step-content">
                  <strong>Scan</strong>
                  <p>Press <code>Scan</code> in the top-right corner to index new camera files into the database.</p>
                </div>
              </div>
              <div className="scenario-step-arrow"><i className="mdi mdi-chevron-down" /></div>

              <div className="scenario-step">
                <div className="step-num">2</div>
                <div className="step-content">
                  <strong>Heatmap</strong>
                  <p>Explore how the data is distributed on the grid. Drill down the levels (Year → Month → Day → Hour) by clicking cells to find activity spikes.</p>
                </div>
              </div>
              <div className="scenario-step-arrow"><i className="mdi mdi-chevron-down" /></div>

              <div className="scenario-step">
                <div className="step-num">3</div>
                <div className="step-content">
                  <strong>Hour Viewer</strong>
                  <p>Click an hour cell to open the detailed view of snapshots and video recordings for that hour.</p>
                </div>
              </div>
              <div className="scenario-step-arrow"><i className="mdi mdi-chevron-down" /></div>

              <div className="scenario-step">
                <div className="step-num">4</div>
                <div className="step-content">
                  <strong>View Mode</strong>
                  <p>Switch the view mode at the top from <code>Normal</code> to <code>Motion highlight</code> or <code>Erosion</code>. This hides the static background and highlights changes.</p>
                </div>
              </div>
              <div className="scenario-step-arrow"><i className="mdi mdi-chevron-down" /></div>

              <div className="scenario-step">
                <div className="step-num">5</div>
                <div className="step-content">
                  <strong>Selection</strong>
                  <p>Press <code>Select</code> (or hold <code>Shift</code> and click) to select a group of files. You can also press <code>Select All</code> in the toolbar.</p>
                </div>
              </div>
              <div className="scenario-step-arrow"><i className="mdi mdi-chevron-down" /></div>

              <div className="scenario-step-danger">
                <div className="step-num-danger"><i className="mdi mdi-trash-can-outline" /></div>
                <div className="step-content">
                  <strong>Safe Delete</strong>
                  <p>Press <code>Delete</code> in the bottom panel, review the file preview in the confirmation dialog, and confirm safe deletion from disk.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Hotkeys Section */}
          <div className="help-section">
            <h3 className="help-section-title"><i className="mdi mdi-keyboard-outline" /> Keyboard shortcuts</h3>
            <div className="hotkeys-grid">
              <div className="hotkey-row">
                <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd>
                <span>Navigate the heatmap grid / file list</span>
              </div>
              <div className="hotkey-row">
                <kbd>Enter</kbd>
                <span>Drill into a heatmap cell / open the original</span>
              </div>
              <div className="hotkey-row">
                <kbd>Esc</kbd> / <kbd>Backspace ⌫</kbd>
                <span>Go back one level up</span>
              </div>
              <div className="hotkey-row">
                <kbd>Space</kbd>
                <span>Select the current cell / file</span>
              </div>
              <div className="hotkey-row">
                <kbd>Ctrl</kbd> + <kbd>A</kbd>
                <span>Select all cells / files</span>
              </div>
              <div className="hotkey-row">
                <kbd>Delete ⌦</kbd>
                <span>Delete the selection</span>
              </div>
            </div>
          </div>

          {/* Uniformity Section */}
          <div className="help-section">
            <h3 className="help-section-title"><i className="mdi mdi-chart-bell-curve" /> Uniformity indicators (false alarms)</h3>
            <p className="help-text">
              The app measures how uniformly files are distributed within an hour to detect false alarms (e.g. caused by wind, rain, or a spider web):
            </p>
            <div className="uniformity-info-grid">
              <div className="uniformity-card af">
                <span className="badge-name">AF (Active Fraction)</span>
                <span className="badge-desc">The share of the hour (in minutes) that has recordings. 100% — something was recorded every minute.</span>
              </div>
              <div className="uniformity-card se">
                <span className="badge-name">SE (Shannon Entropy)</span>
                <span className="badge-desc">How evenly the file volume is spread across the minutes. Indicates randomness.</span>
              </div>
              <div className="uniformity-card bc">
                <span className="badge-name">BC (Block Coverage)</span>
                <span className="badge-desc">How many 5-minute intervals of the hour contain at least one recording.</span>
              </div>
            </div>
            <div className="modal-setting-hint" style={{ marginTop: 10 }}>
              <i className="mdi mdi-information-outline" style={{ marginRight: 4 }} />
              A yellow or red badge on the grid means a highly uniform distribution (likely a cyclic false alarm). Green means rare, isolated events.
            </div>
          </div>
        </div>

        <div className="help-modal-footer">
          <button className="modal-btn" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  )
}
