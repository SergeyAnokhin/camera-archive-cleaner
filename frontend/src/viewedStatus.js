// Viewed status — localStorage-backed, no API calls.
// Each opened hour is recorded. Cells at day/month/year level aggregate.

function viewedKey(cameraId) { return `viewed_hours_${cameraId}` }
function dataHoursKey(cameraId) { return `data_hours_${cameraId}` }

export function markHourViewed(cameraId, dateFrom) {
  // dateFrom like "2024-01-15T09:00:00" → key "2024-01-15T09"
  const hourKey = dateFrom.substring(0, 13)
  try {
    const raw = localStorage.getItem(viewedKey(cameraId))
    const obj = raw ? JSON.parse(raw) : {}
    if (obj[hourKey]) return
    obj[hourKey] = 1
    localStorage.setItem(viewedKey(cameraId), JSON.stringify(obj))
    document.dispatchEvent(new CustomEvent('hour-viewed-change'))
  } catch {}
}

export function cacheDataHours(cameraId, date, hours) {
  // hours: ["09", "10"] — string array of hours that have data for this date
  try {
    const raw = localStorage.getItem(dataHoursKey(cameraId))
    const obj = raw ? JSON.parse(raw) : {}
    obj[date] = hours
    localStorage.setItem(dataHoursKey(cameraId), JSON.stringify(obj))
  } catch {}
}

function getViewedSet(cameraId) {
  try {
    const raw = localStorage.getItem(viewedKey(cameraId))
    if (!raw) return new Set()
    return new Set(Object.keys(JSON.parse(raw)))
  } catch { return new Set() }
}

function getDataHoursMap(cameraId) {
  try {
    const raw = localStorage.getItem(dataHoursKey(cameraId))
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

// Returns 'none' | 'partial' | 'full'
function _computeStatus(period, level, contextDateFrom, viewedSet, dataHoursMap) {
  if (level === 'hour') {
    if (!contextDateFrom) return 'none'
    const date = contextDateFrom.substring(0, 10)
    const hour = period.padStart(2, '0')
    return viewedSet.has(`${date}T${hour}`) ? 'full' : 'none'
  }

  if (level === 'day') {
    const dataHours = dataHoursMap[period] ?? null
    let viewedCount = 0
    for (let h = 0; h < 24; h++) {
      if (viewedSet.has(`${period}T${String(h).padStart(2, '0')}`)) viewedCount++
    }
    if (viewedCount === 0) return 'none'
    if (dataHours !== null && dataHours.length > 0 && viewedCount >= dataHours.length) return 'full'
    return 'partial'
  }

  if (level === 'month') {
    const [y, m] = period.split('-')
    const daysInMonth = new Date(+y, +m, 0).getDate()
    let anyViewed = false, allFull = true
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${period}-${String(d).padStart(2, '0')}`
      const s = _computeStatus(date, 'day', null, viewedSet, dataHoursMap)
      if (s !== 'none') anyViewed = true
      if (s !== 'full') allFull = false
    }
    if (!anyViewed) return 'none'
    return allFull ? 'full' : 'partial'
  }

  if (level === 'year') {
    let anyViewed = false, allFull = true
    for (let mo = 1; mo <= 12; mo++) {
      const month = `${period}-${String(mo).padStart(2, '0')}`
      const s = _computeStatus(month, 'month', null, viewedSet, dataHoursMap)
      if (s !== 'none') anyViewed = true
      if (s !== 'full') allFull = false
    }
    if (!anyViewed) return 'none'
    return allFull ? 'full' : 'partial'
  }

  return 'none'
}

export function computeViewedStatusMap(periods, level, contextDateFrom, cameraId) {
  if (!cameraId) return new Map()
  const viewedSet = getViewedSet(cameraId)
  const dataHoursMap = getDataHoursMap(cameraId)
  const result = new Map()
  for (const cell of periods) {
    if (cell.bucket > 0) {
      result.set(cell.period, _computeStatus(cell.period, level, contextDateFrom, viewedSet, dataHoursMap))
    }
  }
  return result
}
