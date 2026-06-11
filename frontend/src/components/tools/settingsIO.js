// Font-size application + YAML export/import of all Tools settings.
import * as yaml from 'js-yaml'
import {
  FONT_KEY, FONT_MIN, FONT_MAX, FONT_DEFAULT,
  PREVIEWS_PER_CELL_KEY, PREVIEWS_PER_CELL_MIN, PREVIEWS_PER_CELL_MAX, PREVIEWS_PER_CELL_DEFAULT,
  PAGE_SIZE_KEY, PAGE_SIZE_MIN, PAGE_SIZE_MAX, PAGE_SIZE_DEFAULT,
  ZOOM_KEY, ZOOM_MIN, ZOOM_MAX, ZOOM_DEFAULT,
  THUMB_WIDTH_KEY, THUMB_WIDTH_MIN, THUMB_WIDTH_MAX, THUMB_WIDTH_DEFAULT,
  DIFF_THRESHOLD_KEY, DIFF_THRESHOLD_MIN, DIFF_THRESHOLD_MAX, DIFF_THRESHOLD_DEFAULT,
  ETA_WINDOW_KEY, ETA_WINDOW_MIN, ETA_WINDOW_MAX, ETA_WINDOW_DEFAULT,
  LOG_TAIL_KEY, LOG_TAIL_MIN, LOG_TAIL_MAX, LOG_TAIL_DEFAULT,
  GEMINI_MODEL_KEY, GEMINI_DEFAULT_MODEL, GEMINI_PROMPT_KEY, GEMINI_DEFAULT_PROMPT,
  CLAUDE_MODEL_KEY, CLAUDE_DEFAULT_MODEL,
  MOTION_MODE_KEYS,
  BURST_GAP_KEY, BURST_GAP_DEFAULT, BURST_GAP_MIN, BURST_GAP_MAX,
} from './settingsConfig.js'

export function applyFontSize(px) {
  document.documentElement.style.setProperty('--font-base', px + 'px')
}

export function initFontSize() {
  const saved = localStorage.getItem(FONT_KEY)
  if (saved) applyFontSize(Number(saved))
}

function tryParseJSON(s) {
  try { return s ? JSON.parse(s) : null } catch { return null }
}

export function collectSettings() {
  const motionModes = {}
  for (const m of MOTION_MODE_KEYS) {
    motionModes[m] = tryParseJSON(localStorage.getItem('mode_params_' + m)) || { threshold: DIFF_THRESHOLD_DEFAULT }
  }
  return {
    ui: {
      font_size:          Number(localStorage.getItem(FONT_KEY)) || FONT_DEFAULT,
      previews_per_cell:  Number(localStorage.getItem(PREVIEWS_PER_CELL_KEY) ?? PREVIEWS_PER_CELL_DEFAULT),
    },
    tasks: {
      eta_window_minutes: Number(localStorage.getItem(ETA_WINDOW_KEY)) || ETA_WINDOW_DEFAULT,
      log_tail_lines:     Number(localStorage.getItem(LOG_TAIL_KEY)) || LOG_TAIL_DEFAULT,
    },
    hour_view: {
      page_size:       Number(localStorage.getItem(PAGE_SIZE_KEY)) || PAGE_SIZE_DEFAULT,
      thumb_width:     Number(localStorage.getItem(THUMB_WIDTH_KEY)) || THUMB_WIDTH_DEFAULT,
      hover_zoom:      Number(localStorage.getItem(ZOOM_KEY)) || ZOOM_DEFAULT,
      diff_threshold:  Number(localStorage.getItem(DIFF_THRESHOLD_KEY) ?? DIFF_THRESHOLD_DEFAULT),
      burst_gap:       Number(localStorage.getItem(BURST_GAP_KEY)) || BURST_GAP_DEFAULT,
      view_mode:       localStorage.getItem('hour_view_mode') || 'normal',
    },
    motion_modes: motionModes,
    google_ai: {
      model:   localStorage.getItem(GEMINI_MODEL_KEY) || GEMINI_DEFAULT_MODEL,
      api_key: '# Get your key at aistudio.google.com',
      prompt:  localStorage.getItem(GEMINI_PROMPT_KEY) || GEMINI_DEFAULT_PROMPT,
    },
    claude_ai: {
      model:   localStorage.getItem(CLAUDE_MODEL_KEY) || CLAUDE_DEFAULT_MODEL,
      api_key: '# Get your key at console.anthropic.com',
    },
  }
}

export function exportSettingsYaml() {
  const header = `# Camera Snapshots Cleaner — settings export\n# Generated: ${new Date().toISOString()}\n\n`
  const body = yaml.dump(collectSettings(), { lineWidth: 120, quotingType: '"' })
  const blob = new Blob([header + body], { type: 'text/yaml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'snapshots-settings.yaml'
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Apply a parsed settings object: writes recognised keys to localStorage, applies
 * the font size and dispatches the live-update CustomEvents. Unknown or invalid
 * values are silently skipped. Returns the number of settings applied.
 */
export function applyImportedSettings(data) {
  if (!data || typeof data !== 'object') return 0
  let applied = 0

  function safeNum(val, min, max) {
    const n = Number(val)
    if (isNaN(n)) return null
    return Math.max(min, Math.min(max, n))
  }
  function safeStr(val, allowed) {
    if (typeof val !== 'string') return null
    return !allowed || allowed.includes(val) ? val : null
  }

  const fs = safeNum(data?.ui?.font_size, FONT_MIN, FONT_MAX)
  if (fs !== null) {
    localStorage.setItem(FONT_KEY, fs); applyFontSize(fs)
    document.dispatchEvent(new CustomEvent('font-base-change', { detail: fs })); applied++
  }
  const ppc = safeNum(data?.ui?.previews_per_cell, PREVIEWS_PER_CELL_MIN, PREVIEWS_PER_CELL_MAX)
  if (ppc !== null) {
    localStorage.setItem(PREVIEWS_PER_CELL_KEY, ppc)
    document.dispatchEvent(new CustomEvent('previews-per-cell-change', { detail: ppc })); applied++
  }
  const etaW = safeNum(data?.tasks?.eta_window_minutes, ETA_WINDOW_MIN, ETA_WINDOW_MAX)
  if (etaW !== null) { localStorage.setItem(ETA_WINDOW_KEY, etaW); applied++ }
  const logTail = safeNum(data?.tasks?.log_tail_lines, LOG_TAIL_MIN, LOG_TAIL_MAX)
  if (logTail !== null) { localStorage.setItem(LOG_TAIL_KEY, logTail); applied++ }
  const ps = safeNum(data?.hour_view?.page_size, PAGE_SIZE_MIN, PAGE_SIZE_MAX)
  if (ps !== null) {
    localStorage.setItem(PAGE_SIZE_KEY, ps)
    document.dispatchEvent(new CustomEvent('hour-page-size-change', { detail: ps })); applied++
  }
  const tw = safeNum(data?.hour_view?.thumb_width, THUMB_WIDTH_MIN, THUMB_WIDTH_MAX)
  if (tw !== null) {
    localStorage.setItem(THUMB_WIDTH_KEY, tw)
    document.dispatchEvent(new CustomEvent('thumb-width-change', { detail: tw })); applied++
  }
  const hz = safeNum(data?.hour_view?.hover_zoom, ZOOM_MIN, ZOOM_MAX)
  if (hz !== null) {
    localStorage.setItem(ZOOM_KEY, hz)
    document.dispatchEvent(new CustomEvent('hover-zoom-change', { detail: hz })); applied++
  }
  const dt = safeNum(data?.hour_view?.diff_threshold, DIFF_THRESHOLD_MIN, DIFF_THRESHOLD_MAX)
  if (dt !== null) {
    localStorage.setItem(DIFF_THRESHOLD_KEY, dt)
    document.dispatchEvent(new CustomEvent('diff-threshold-change', { detail: dt })); applied++
  }
  const bg = safeNum(data?.hour_view?.burst_gap, BURST_GAP_MIN, BURST_GAP_MAX)
  if (bg !== null) {
    localStorage.setItem(BURST_GAP_KEY, bg)
    document.dispatchEvent(new CustomEvent('burst-gap-change', { detail: bg })); applied++
  }
  const vm = safeStr(data?.hour_view?.view_mode)
  if (vm !== null) { localStorage.setItem('hour_view_mode', vm); applied++ }

  const mm = data?.motion_modes
  if (mm && typeof mm === 'object') {
    for (const key of MOTION_MODE_KEYS) {
      const t = safeNum(mm[key]?.threshold, DIFF_THRESHOLD_MIN, DIFF_THRESHOLD_MAX)
      if (t !== null) {
        localStorage.setItem('mode_params_' + key, JSON.stringify({ threshold: t })); applied++
      }
    }
  }

  const gModel = safeStr(data?.google_ai?.model)
  if (gModel) { localStorage.setItem(GEMINI_MODEL_KEY, gModel); applied++ }
  const gPrompt = safeStr(data?.google_ai?.prompt)
  if (gPrompt !== null) { localStorage.setItem(GEMINI_PROMPT_KEY, gPrompt); applied++ }

  const cModel = safeStr(data?.claude_ai?.model)
  if (cModel) { localStorage.setItem(CLAUDE_MODEL_KEY, cModel); applied++ }

  return applied
}
