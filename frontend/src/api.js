import { DETECTION_CLASSES_DEFAULT } from './cocoClasses.js'

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

export function getCameraDateRange(cameraId) {
  return get(`/cameras/${encodeURIComponent(cameraId)}/date_range`)
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

export function getVideoThumbnailUrl(fileId, mode) {
  return `${BASE}/video_thumbnail/${fileId}?mode=${mode}`
}

export function getDistribution(cameraId, dateFrom, dateTo) {
  return get('/distribution' + buildQuery({
    camera_id: cameraId,
    date_from: dateFrom,
    date_to: dateTo,
  }))
}

export function clearDatabase(cameraId = null) {
  return del('/database' + buildQuery({ camera_id: cameraId }))
}

export function vacuumDatabase() {
  return post('/database/vacuum')
}

export function clearThumbnails(cameraId = null) {
  return del('/thumbnails' + buildQuery({ camera_id: cameraId }))
}

export function getDiffThumbnailUrl(fileId, pageIds, threshold) {
  return `${BASE}/diff_thumbnail/${fileId}?page_ids=${pageIds.join(',')}&threshold=${threshold}`
}

export function clearDiffThumbnails(cameraId = null) {
  return del('/diff_thumbnails' + buildQuery({ camera_id: cameraId }))
}

export function getDiffZoomThumbnailUrl(fileId, pageIds, threshold) {
  return `${BASE}/diff_zoom_thumbnail/${fileId}?page_ids=${pageIds.join(',')}&threshold=${threshold}`
}

export function clearDiffZoomThumbnails(cameraId = null) {
  return del('/diff_zoom_thumbnails' + buildQuery({ camera_id: cameraId }))
}

export function getErosionThumbnailUrl(fileId, pageIds, threshold) {
  return `${BASE}/erosion_thumbnail/${fileId}?page_ids=${pageIds.join(',')}&threshold=${threshold}`
}

export function clearErosionThumbnails(cameraId = null) {
  return del('/erosion_thumbnails' + buildQuery({ camera_id: cameraId }))
}

export function getMotionThumbnailUrl(fileId, pageIds, threshold, mode) {
  return `${BASE}/motion_thumbnail/${fileId}?page_ids=${pageIds.join(',')}&threshold=${threshold}&mode=${mode}`
}

export function clearMotionThumbnails(cameraId = null) {
  return del('/motion_thumbnails' + buildQuery({ camera_id: cameraId }))
}

export function clearVideoThumbnails(cameraId = null) {
  return del('/video_thumbnails' + buildQuery({ camera_id: cameraId }))
}

export function clearOpenVinoThumbnails(cameraId = null) {
  return del('/openvino_thumbnails' + buildQuery({ camera_id: cameraId }))
}

export function clearAllThumbnails(cameraId = null) {
  return del('/all_thumbnails' + buildQuery({ camera_id: cameraId }))
}

export function getStorageInfo() {
  return get('/storage_info')
}

export function getTaskMaxErrors() {
  const val = parseInt(localStorage.getItem('task_max_errors') ?? '5', 10)
  return isNaN(val) || val <= 0 ? null : val
}

async function sendJson(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
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

function postJson(path, body) {
  return sendJson('POST', path, body)
}

function putJson(path, body) {
  return sendJson('PUT', path, body)
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

export function openvinoAnalyzeBatch({ fileIds, modelName, confidence, classes = null }) {
  return postJson('/openvino_analyze_batch', { file_ids: fileIds, model_name: modelName, confidence, classes })
}

export function getOpenVinoBboxThumbnailUrl(fileId, model, confidence, classes = '') {
  let url = `${BASE}/openvino_thumbnail/${fileId}?model=${encodeURIComponent(model)}&confidence=${confidence}`
  if (classes) url += `&classes=${encodeURIComponent(classes)}`
  return url
}

// Selected COCO class IDs as a comma-separated string. Falls back to defaults if never saved.
export function getClassesParam() {
  try {
    const raw = localStorage.getItem('detection_classes')
    const ids = raw ? JSON.parse(raw) : DETECTION_CLASSES_DEFAULT
    return ids.join(',')
  } catch { return DETECTION_CLASSES_DEFAULT.join(',') }
}

export function getClassesList() {
  try {
    const raw = localStorage.getItem('detection_classes')
    return raw ? JSON.parse(raw) : DETECTION_CLASSES_DEFAULT
  } catch { return DETECTION_CLASSES_DEFAULT }
}

export function openvinoAnalyzeRange({ cameraId, dateFrom, dateTo, modelName, confidence, classes = null, videoThumbMode = null }) {
  return postJson('/openvino_analyze_range', { camera_id: cameraId, date_from: dateFrom, date_to: dateTo, model_name: modelName, confidence, classes, video_thumb_mode: videoThumbMode || null })
}

export function getAiAnalysisInRange(cameraId, dateFrom, dateTo, provider = 'openvino') {
  return get('/ai_analysis_in_range' + buildQuery({ camera_id: cameraId, date_from: dateFrom, date_to: dateTo, provider }))
}

export function getAiObjectsSummary(cameraId, dateFrom, dateTo) {
  return get('/ai_objects_summary' + buildQuery({ camera_id: cameraId, date_from: dateFrom, date_to: dateTo }))
}

export function getAiAnalysis(fileIds) {
  if (!fileIds.length) return Promise.resolve([])
  return get('/ai_analysis?file_ids=' + fileIds.join(','))
}

export function getServicesStatus() {
  return get('/services/status')
}

export function getComputeConfig() {
  return get('/compute/config')
}

export function getComputeStatus() {
  return get('/compute/status')
}

export function saveComputeConfig(mode, remoteUrl) {
  return putJson('/compute/config', { mode, remote_url: remoteUrl })
}

export function pingComputeConfig(mode, remoteUrl) {
  return postJson('/compute/ping', { mode, remote_url: remoteUrl })
}

export function getComputeClientIp() {
  return get('/compute/client-ip')
}

export function discoverCompute() {
  return get('/compute/discover')
}

// Tasks
export function getTasks() {
  return get('/tasks')
}

export function pauseAllTasks() {
  return sendJson('PUT', '/tasks/pause_all', {})
}

export function resumeAllTasks() {
  return sendJson('PUT', '/tasks/resume_all', {})
}

export function createTask({ type, params, label }) {
  const maxErrors = getTaskMaxErrors()
  const fullParams = maxErrors != null ? { max_errors: maxErrors, ...params } : params
  return postJson('/tasks', { type, params: fullParams, label })
}

export function deleteTask(taskId) {
  return sendJson('DELETE', `/tasks/${taskId}`, {})
}

export function pauseTask(taskId) {
  return putJson(`/tasks/${taskId}/pause`, {})
}

export function resumeTask(taskId) {
  return putJson(`/tasks/${taskId}/resume`, {})
}

export function skipTask(taskId) {
  return putJson(`/tasks/${taskId}/skip`, {})
}

export function cancelTask(taskId) {
  return putJson(`/tasks/${taskId}/cancel`, {})
}

export function reorderTasks(order) {
  return putJson('/tasks/reorder', { order })
}

export function getTaskMetrics() {
  return get('/tasks/metrics')
}

// Tuning
export function getTuningSessions() {
  return get('/tuning/sessions')
}

export async function createTuningSession({ name, files }) {
  const form = new FormData()
  form.append('name', name)
  for (const f of files) form.append('files', f)
  const res = await fetch(BASE + '/tuning/sessions', { method: 'POST', body: form })
  if (!res.ok) {
    let msg = `API ${res.status}: /tuning/sessions`
    try { const j = await res.json(); msg = j.detail || j.traceback || msg } catch {}
    throw new Error(msg)
  }
  return res.json()
}

export function getTuningSession(id) {
  return get(`/tuning/sessions/${id}`)
}

export function getTuningImageUrl(sessionId, imageId) {
  return `${BASE}/tuning/sessions/${sessionId}/image/${imageId}`
}

export function deleteTuningSession(id) {
  return sendJson('DELETE', `/tuning/sessions/${id}`, {})
}

export function runAutolabel(sessionId, { model, confidence }) {
  return postJson(`/tuning/sessions/${sessionId}/autolabel`, { model, confidence })
}

export function saveTuningGroundTruth(sessionId, groundTruth) {
  return putJson(`/tuning/sessions/${sessionId}/ground_truth`, { ground_truth: groundTruth })
}

export function startTuningBenchmark(sessionId, { confFrom, confTo, iterations }) {
  return postJson(`/tuning/sessions/${sessionId}/benchmark`, {
    conf_from: confFrom,
    conf_to: confTo,
    iterations,
  })
}
