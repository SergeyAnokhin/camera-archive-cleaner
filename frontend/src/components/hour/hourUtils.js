import { VIEW_MODES } from '../viewModes/index.js'

// localStorage keys + defaults shared across the hour viewer
export const PAGE_SIZE_KEY        = 'hour_page_size'
export const PAGE_SIZE_DEFAULT    = 50
export const ZOOM_KEY             = 'hover_zoom'
export const ZOOM_DEFAULT         = 1.5
export const THUMB_WIDTH_KEY      = 'thumb_width'
export const THUMB_WIDTH_DEFAULT  = 140
export const DIFF_THRESHOLD_KEY   = 'diff_threshold'
export const DIFF_THRESHOLD_DEFAULT = 20
export const VIEW_MODE_KEY        = 'hour_view_mode'
export const MODE_PARAMS_PREFIX   = 'mode_params_'

export function getPageSize()   { return Number(localStorage.getItem(PAGE_SIZE_KEY)) || PAGE_SIZE_DEFAULT }
export function getHoverZoom()  { return Number(localStorage.getItem(ZOOM_KEY)) || ZOOM_DEFAULT }
export function getThumbWidth() { return Number(localStorage.getItem(THUMB_WIDTH_KEY)) || THUMB_WIDTH_DEFAULT }

export function loadModeParams(modeKey, defaults) {
  try {
    const raw = localStorage.getItem(MODE_PARAMS_PREFIX + modeKey)
    if (raw) return { ...defaults, ...JSON.parse(raw) }
  } catch {}
  return defaults
}

export function saveModeParams(modeKey, params) {
  localStorage.setItem(MODE_PARAMS_PREFIX + modeKey, JSON.stringify(params))
}

export function buildInitialModeParams() {
  const globalDefault = Number(localStorage.getItem(DIFF_THRESHOLD_KEY)) || DIFF_THRESHOLD_DEFAULT
  const result = {}
  for (const m of VIEW_MODES) {
    if (!m.params?.length) continue
    const defaults = Object.fromEntries(m.params.map(p => [p.key, p.key === 'threshold' ? globalDefault : p.default]))
    result[m.key] = loadModeParams(m.key, defaults)
  }
  return result
}

export function formatTime(ts) { return ts ? ts.substring(11, 19) : '' }

export function formatBytes(b) {
  if (!b) return '0 B'
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`
  return `${(b / 1e3).toFixed(0)} KB`
}

// ── AI request rate tracking (localStorage ring buffer of timestamps) ──────────

export function recordAiRequest(provider) {
  const key = `ai_requests_${provider}`
  const now = Date.now()
  const arr = JSON.parse(localStorage.getItem(key) || '[]')
  arr.push(now)
  const cutoff = now - 25 * 60 * 60 * 1000  // keep 25h to be safe
  localStorage.setItem(key, JSON.stringify(arr.filter(t => t > cutoff)))
}

export function getAiRequestStats(provider) {
  const key = `ai_requests_${provider}`
  const now = Date.now()
  const arr = JSON.parse(localStorage.getItem(key) || '[]')
  return {
    lastMinute: arr.filter(t => t > now - 60_000).length,
    last24h:    arr.filter(t => t > now - 86_400_000).length,
  }
}
