const BASE = '/api'

async function get(path) {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  return res.json()
}

async function post(path) {
  const res = await fetch(BASE + path, { method: 'POST' })
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  return res.json()
}

function buildQuery(params) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined) q.set(k, v)
  }
  const s = q.toString()
  return s ? '?' + s : ''
}

export function getCameras() {
  return get('/cameras')
}

export function triggerScan(cameraId = null) {
  return post('/scan' + buildQuery({ camera_id: cameraId }))
}

export function getStatsTotal(cameraId = null) {
  return get('/stats' + buildQuery({ group_by: 'total', camera_id: cameraId }))
}

export function getStatsGrouped(groupBy, { cameraId = null, dateFrom = null, dateTo = null } = {}) {
  return get('/stats' + buildQuery({
    group_by: groupBy,
    camera_id: cameraId,
    date_from: dateFrom,
    date_to: dateTo,
  }))
}
