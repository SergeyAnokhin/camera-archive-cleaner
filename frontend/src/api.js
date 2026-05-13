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

async function del(path) {
  const res = await fetch(BASE + path, { method: 'DELETE' })
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

export function getStatsTotal(cameraId = null, dateFrom = null, dateTo = null) {
  return get('/stats' + buildQuery({ group_by: 'total', camera_id: cameraId, date_from: dateFrom, date_to: dateTo }))
}

export function getStatsGrouped(groupBy, { cameraId = null, dateFrom = null, dateTo = null } = {}) {
  return get('/stats' + buildQuery({
    group_by: groupBy,
    camera_id: cameraId,
    date_from: dateFrom,
    date_to: dateTo,
  }))
}

export function getFiles(cameraId, dateFrom, dateTo, page, pageSize) {
  return get('/files' + buildQuery({
    camera_id: cameraId,
    date_from: dateFrom,
    date_to: dateTo,
    page,
    page_size: pageSize,
  }))
}

export function getPreviews(cameraId, dateFrom, dateTo, count) {
  return get('/previews' + buildQuery({
    camera_id: cameraId,
    date_from: dateFrom,
    date_to: dateTo,
    count,
  }))
}

export function getThumbnailUrl(fileId) {
  return `${BASE}/thumbnail/${fileId}`
}

export function getMediaUrl(fileId) {
  return `${BASE}/media/${fileId}`
}

export function getDistribution(cameraId, dateFrom, dateTo) {
  return get('/distribution' + buildQuery({
    camera_id: cameraId,
    date_from: dateFrom,
    date_to: dateTo,
  }))
}

export function clearDatabase() {
  return del('/database')
}

export function clearThumbnails() {
  return del('/thumbnails')
}

export function getDiffThumbnailUrl(fileId, pageIds, threshold) {
  return `${BASE}/diff_thumbnail/${fileId}?page_ids=${pageIds.join(',')}&threshold=${threshold}`
}

export function clearDiffThumbnails() {
  return del('/diff_thumbnails')
}

export function getErosionThumbnailUrl(fileId, pageIds, threshold) {
  return `${BASE}/erosion_thumbnail/${fileId}?page_ids=${pageIds.join(',')}&threshold=${threshold}`
}

export function clearErosionThumbnails() {
  return del('/erosion_thumbnails')
}

async function postJson(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  return res.json()
}

export function previewDelete(fileIds) {
  return postJson('/delete/preview', { file_ids: fileIds })
}

export function confirmDelete(fileIds) {
  return postJson('/delete/confirm', { file_ids: fileIds })
}

export function deleteByRange(cameraId, dateFrom, dateTo) {
  return postJson('/delete/by_range', { camera_id: cameraId, date_from: dateFrom, date_to: dateTo })
}
