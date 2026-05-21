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

// ── Distribution uniformity analysis ──────────────────────────────────────────
export const UNIFORMITY_METHOD_KEY     = 'uniformity_method'
export const UNIFORMITY_METHOD_DEFAULT = 'combined'

// Per-metric defaults { warn, alert }
const METRIC_DEFAULTS = {
  af:       { warn: 40, alert: 65 },
  se:       { warn: 55, alert: 80 },
  bc:       { warn: 40, alert: 65 },
  combined: { warn: 50, alert: 72 },
}

export function getMetricThresholds(metric) {
  const def = METRIC_DEFAULTS[metric] ?? METRIC_DEFAULTS.combined
  const w = Number(localStorage.getItem(`uniformity_${metric}_warn`))
  const a = Number(localStorage.getItem(`uniformity_${metric}_alert`))
  return { warn: w > 0 ? w : def.warn, alert: a > 0 ? a : def.alert }
}

export function getUniformityMethod() {
  return localStorage.getItem(UNIFORMITY_METHOD_KEY) || UNIFORMITY_METHOD_DEFAULT
}

function levelFor(score, metric) {
  const { warn, alert: alertThresh } = getMetricThresholds(metric)
  return score >= alertThresh ? 'alert' : score >= warn ? 'warn' : null
}

/**
 * Compute three uniformity metrics from per-minute distribution buckets.
 * 0 = one concentrated event, 100 = recording every minute (noise/rain).
 *
 * AF — Active Fraction:   nActive / 60 × 100
 * SE — Shannon Entropy:   H / log2(60) × 100  (normalized to full hour)
 * BC — Block Coverage:    active 5-min blocks / 12 × 100
 */
export function computeUniformity(buckets) {
  if (!buckets?.length) return null
  const counts = buckets.map(b => b.total_count ?? 0)
  const total = counts.reduce((s, c) => s + c, 0)
  if (total === 0) return null

  const nActive = counts.filter(c => c > 0).length

  // AF: fraction of 60 minutes with any recording
  const af = Math.round((nActive / 60) * 100)

  // SE: Shannon entropy normalised to max possible over all 60 slots
  let entropy = 0
  for (const c of counts) {
    if (c > 0) { const p = c / total; entropy -= p * Math.log2(p) }
  }
  const se = Math.round((entropy / Math.log2(60)) * 100)

  // BC: how many of 12 five-minute blocks have ≥1 recording
  let activeBlocks = 0
  for (let b = 0; b < 12; b++) {
    if (counts.slice(b * 5, b * 5 + 5).some(c => c > 0)) activeBlocks++
  }
  const bc = Math.round((activeBlocks / 12) * 100)

  const combined = Math.round(0.40 * af + 0.35 * se + 0.25 * bc)

  return {
    activeFraction:    af,
    normalizedEntropy: se,
    blockCoverage:     bc,
    score:    combined,
    level:    levelFor(combined, 'combined'),
    methods:  { combined, active: af, entropy: se, bc },
    levelByMethod: {
      combined: levelFor(combined, 'combined'),
      active:   levelFor(af, 'af'),
      entropy:  levelFor(se, 'se'),
      bc:       levelFor(bc, 'bc'),
    },
  }
}
