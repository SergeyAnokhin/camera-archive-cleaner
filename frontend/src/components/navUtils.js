// Heatmap navigation helpers — drill levels, date ranges, intensity buckets,
// nav-state persistence. Shared by App and useHeatmapKeyboard.

export const LEVELS = ['year', 'month', 'day', 'hour']
export const GRID_COLS = { year: 4, month: 4, day: 7, hour: 6 }

export const PREVIEWS_PER_CELL_KEY = 'previews_per_cell'
export const PREVIEWS_PER_CELL_DEFAULT = 3

const NAV_STATE_KEY = 'nav_state'

export function loadNavState() {
  try { return JSON.parse(localStorage.getItem(NAV_STATE_KEY) || 'null') ?? {} } catch { return {} }
}

export function saveNavState(s) {
  localStorage.setItem(NAV_STATE_KEY, JSON.stringify(s))
}

export function getPreviewsPerCell() {
  return Number(localStorage.getItem(PREVIEWS_PER_CELL_KEY)) || PREVIEWS_PER_CELL_DEFAULT
}

export function dateRangeForPeriod(period, level) {
  if (level === 'year') {
    return { dateFrom: `${period}-01-01T00:00:00`, dateTo: `${period}-12-31T23:59:59` }
  }
  if (level === 'month') {
    const [y, m] = period.split('-')
    const lastDay = new Date(+y, +m, 0).getDate()
    return {
      dateFrom: `${period}-01T00:00:00`,
      dateTo: `${period}-${String(lastDay).padStart(2, '0')}T23:59:59`,
    }
  }
  if (level === 'day') {
    return { dateFrom: `${period}T00:00:00`, dateTo: `${period}T23:59:59` }
  }
  return {}
}

export function computeIntensity(periods) {
  const max = Math.max(...periods.map(p => p.total_size_bytes), 1)
  return periods.map(p => ({
    ...p,
    bucket: p.total_size_bytes === 0 ? 0 : Math.ceil((p.total_size_bytes / max) * 9),
  }))
}

export function formatBytes(b) {
  if (!b) return '0 B'
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`
  if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`
  return `${(b / 1e3).toFixed(0)} KB`
}
