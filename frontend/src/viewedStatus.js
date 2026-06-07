// Viewed status — localStorage-backed, no API calls.
// Each opened hour is recorded. Cells at day/month/year level aggregate.

function viewedKey(cameraId)     { return `viewed_hours_${cameraId}` }
function dataHoursKey(cameraId)  { return `data_hours_${cameraId}` }
function dataDaysKey(cameraId)   { return `data_days_${cameraId}` }
function dataMonthsKey(cameraId) { return `data_months_${cameraId}` }

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
  // hours: ["09", "10"] — hours with data for this date
  _cacheChildSet(dataHoursKey(cameraId), date, hours)
}

export function cacheDataDays(cameraId, month, days) {
  // days: ["2024-01-15", "2024-01-20"] — days with data in this month
  _cacheChildSet(dataDaysKey(cameraId), month, days)
}

export function cacheDataMonths(cameraId, year, months) {
  // months: ["2024-01", "2024-03"] — months with data in this year
  _cacheChildSet(dataMonthsKey(cameraId), year, months)
}

function _cacheChildSet(key, parent, children) {
  try {
    const raw = localStorage.getItem(key)
    const obj = raw ? JSON.parse(raw) : {}
    obj[parent] = children
    localStorage.setItem(key, JSON.stringify(obj))
  } catch {}
}

function _readMap(key) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

// Returns 'none' | 'partial' | 'full'
// Rule for aggregation: 'none' children (no data / unvisited) are ignored.
// Only 'partial' children lower the result from 'full' to 'partial'.
function _computeStatus(period, level, contextDateFrom, viewedSet, dataHoursMap, dataDaysMap, dataMonthsMap) {
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
    // Use cached list of data days if available; otherwise iterate all possible days.
    const knownDataDays = dataDaysMap[period] ?? null
    const days = knownDataDays ?? (() => {
      const [y, m] = period.split('-')
      const n = new Date(+y, +m, 0).getDate()
      return Array.from({ length: n }, (_, i) => `${period}-${String(i + 1).padStart(2, '0')}`)
    })()

    let anyViewed = false, allFull = true
    for (const date of days) {
      const s = _computeStatus(date, 'day', null, viewedSet, dataHoursMap, dataDaysMap, dataMonthsMap)
      if (s !== 'none') anyViewed = true
      if (s === 'partial') allFull = false   // 'none' = unknown/empty → ignored
    }
    if (!anyViewed) return 'none'
    return allFull ? 'full' : 'partial'
  }

  if (level === 'year') {
    const knownDataMonths = dataMonthsMap[period] ?? null
    const months = knownDataMonths ?? Array.from({ length: 12 }, (_, i) =>
      `${period}-${String(i + 1).padStart(2, '0')}`)

    let anyViewed = false, allFull = true
    for (const month of months) {
      const s = _computeStatus(month, 'month', null, viewedSet, dataHoursMap, dataDaysMap, dataMonthsMap)
      if (s !== 'none') anyViewed = true
      if (s === 'partial') allFull = false   // 'none' = unknown/empty → ignored
    }
    if (!anyViewed) return 'none'
    return allFull ? 'full' : 'partial'
  }

  return 'none'
}

export function computeViewedStatusMap(periods, level, contextDateFrom, cameraId) {
  if (!cameraId) return new Map()
  const viewedSet   = _readMap(viewedKey(cameraId))    // plain object for quick has()
  const viewedSetObj = viewedSet                        // kept as object; use `in` operator
  const viewedSetProxy = { has: k => k in viewedSetObj }
  const dataHoursMap  = _readMap(dataHoursKey(cameraId))
  const dataDaysMap   = _readMap(dataDaysKey(cameraId))
  const dataMonthsMap = _readMap(dataMonthsKey(cameraId))
  const result = new Map()
  for (const cell of periods) {
    if (cell.bucket > 0) {
      result.set(cell.period, _computeStatus(
        cell.period, level, contextDateFrom,
        viewedSetProxy, dataHoursMap, dataDaysMap, dataMonthsMap,
      ))
    }
  }
  return result
}
