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

export function getDiffZoomThumbnailUrl(fileId, pageIds, threshold) {
  return `${BASE}/diff_zoom_thumbnail/${fileId}?page_ids=${pageIds.join(',')}&threshold=${threshold}`
}

export function clearDiffZoomThumbnails() {
  return del('/diff_zoom_thumbnails')
}

export function getErosionThumbnailUrl(fileId, pageIds, threshold) {
  return `${BASE}/erosion_thumbnail/${fileId}?page_ids=${pageIds.join(',')}&threshold=${threshold}`
}

export function clearErosionThumbnails() {
  return del('/erosion_thumbnails')
}

export function getMotionThumbnailUrl(fileId, pageIds, threshold, mode) {
  return `${BASE}/motion_thumbnail/${fileId}?page_ids=${pageIds.join(',')}&threshold=${threshold}&mode=${mode}`
}

export function clearMotionThumbnails() {
  return del('/motion_thumbnails')
}

export function clearAllThumbnails() {
  return del('/all_thumbnails')
}

export function getStorageInfo() {
  return get('/storage_info')
}

async function postJson(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let msg = `API ${res.status}: ${path}`
    try {
      const j = await res.json()
      if (j.traceback) msg = j.traceback
      else if (j.detail) msg = j.detail
    } catch {}
    throw new Error(msg)
  }
  return res.json()
}

export function previewDelete(fileIds) {
  return postJson('/delete/preview', { file_ids: fileIds })
}

export function confirmDelete(fileIds) {
  return postJson('/delete/confirm', { file_ids: fileIds })
}

export function previewDeleteRange(cameraId, dateFrom, dateTo) {
  return postJson('/delete/preview_range', { camera_id: cameraId, date_from: dateFrom, date_to: dateTo })
}

export function deleteByRange(cameraId, dateFrom, dateTo) {
  return postJson('/delete/by_range', { camera_id: cameraId, date_from: dateFrom, date_to: dateTo })
}

export function geminiAnalyze({ fileIds, prompt, model, apiKey }) {
  return postJson('/gemini_analyze', { file_ids: fileIds, prompt, model, api_key: apiKey })
}

export function geminiAnalyzeBatch({ fileIds, prompt, model, apiKey }) {
  return postJson('/gemini_analyze_batch', { file_ids: fileIds, prompt, model, api_key: apiKey })
}

export function claudeAnalyzeBatch({ fileIds, prompt, model, apiKey }) {
  return postJson('/claude_analyze_batch', { file_ids: fileIds, prompt, model, api_key: apiKey })
}

export function openvinoAnalyzeBatch({ fileIds, modelName, confidence }) {
  return postJson('/openvino_analyze_batch', { file_ids: fileIds, model_name: modelName, confidence })
}

export function getOpenVinoBboxThumbnailUrl(fileId, model, confidence, excluded = '') {
  let url = `${BASE}/openvino_thumbnail/${fileId}?model=${encodeURIComponent(model)}&confidence=${confidence}`
  if (excluded) url += `&excluded=${encodeURIComponent(excluded)}`
  return url
}

export function getExcludedParam() {
  try {
    const raw = localStorage.getItem('detection_excluded_objects')
    return raw ? JSON.parse(raw).join(',') : ''
  } catch { return '' }
}

export function openvinoAnalyzeRange({ cameraId, dateFrom, dateTo, modelName, confidence }) {
  return postJson('/openvino_analyze_range', { camera_id: cameraId, date_from: dateFrom, date_to: dateTo, model_name: modelName, confidence })
}

export function getAiObjectsSummary(cameraId, dateFrom, dateTo) {
  return get('/ai_objects_summary' + buildQuery({ camera_id: cameraId, date_from: dateFrom, date_to: dateTo }))
}

export function getAiAnalysis(fileIds) {
  if (!fileIds.length) return Promise.resolve([])
  return get('/ai_analysis?file_ids=' + fileIds.join(','))
}
