// Task queue REST endpoints (/tasks).
import { get, buildQuery, sendJson, postJson, putJson } from './http.js'

export function getTaskMaxErrors() {
  const val = parseInt(localStorage.getItem('task_max_errors') ?? '5', 10)
  return isNaN(val) || val <= 0 ? null : val
}

export function getFileEstimate({ cameraId, taskType, inputPattern, dateFrom, dateTo, outputSuffix }) {
  return get('/tasks/estimate_files' + buildQuery({
    camera_id:     cameraId,
    task_type:     taskType,
    input_pattern: inputPattern,
    date_from:     dateFrom  || undefined,
    date_to:       dateTo    || undefined,
    output_suffix: outputSuffix || undefined,
  }))
}

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

export function getTaskLogs(taskId) {
  return get(`/tasks/${encodeURIComponent(taskId)}/logs`)
}
