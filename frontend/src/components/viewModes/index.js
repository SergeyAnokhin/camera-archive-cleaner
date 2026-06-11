import normalMode from './normalMode.js'
import motionDiffMode from './motionDiffMode.js'
import erosionMode from './erosionMode.js'
import geminiMode from './geminiMode.js'
import claudeMode from './claudeMode.js'
import openvinoMode from './openvinoMode.js'

export const VIEW_MODES = [
  normalMode,
  motionDiffMode,
  erosionMode,
  geminiMode,
  claudeMode,
  openvinoMode,
]
export const DEFAULT_VIEW_MODE_KEY = normalMode.key

function isComputeOff() {
  try { return localStorage.getItem('compute_mode') === 'off' } catch { return false }
}

// View modes available given the current compute-service mode.
// Modes flagged `needsCompute` are hidden when the compute-service is off.
export function getEnabledViewModes() {
  return isComputeOff() ? VIEW_MODES.filter(m => !m.needsCompute) : VIEW_MODES
}

// All view modes with a disabled flag + reason for modes requiring compute.
export function getViewModesWithStatus() {
  const off = isComputeOff()
  return VIEW_MODES.map(m => ({
    ...m,
    disabled: off && !!m.needsCompute,
    disabledHint: (off && m.needsCompute) ? 'Включите compute-service в Tools → Compute' : '',
  }))
}
