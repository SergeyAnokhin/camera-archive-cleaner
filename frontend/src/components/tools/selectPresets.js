// Load / validate / save the selection-mode presets (see SELECT_PRESETS_KEY in settingsConfig.js).
import { SELECT_PRESETS_KEY, SELECT_PRESETS_DEFAULT } from './settingsConfig.js'

// Returns a clean preset array, or null if `raw` is not an array of valid presets.
export function sanitizePresets(raw) {
  if (!Array.isArray(raw)) return null
  const presets = []
  for (const p of raw) {
    if (!p || typeof p.label !== 'string' || !Array.isArray(p.classes)) continue
    const label = p.label.trim().slice(0, 40)
    if (!label) continue
    presets.push({
      id: typeof p.id === 'string' && p.id ? p.id : `p${presets.length}-${label}`,
      label,
      classes: [...new Set(p.classes.filter(c => Number.isInteger(c) && c >= 0 && c < 80))].sort((a, b) => a - b),
    })
  }
  return presets
}

export function loadSelectPresets() {
  try {
    const raw = localStorage.getItem(SELECT_PRESETS_KEY)
    if (raw) return sanitizePresets(JSON.parse(raw)) ?? SELECT_PRESETS_DEFAULT
  } catch {}
  return SELECT_PRESETS_DEFAULT
}

export function saveSelectPresets(presets) {
  localStorage.setItem(SELECT_PRESETS_KEY, JSON.stringify(presets))
  document.dispatchEvent(new CustomEvent('select-presets-change'))
}
