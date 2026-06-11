// AI analysis endpoints: Gemini, Claude, OpenVINO + analysis queries.
import { DETECTION_CLASSES_DEFAULT } from '../cocoClasses.js'
import { BASE, get, buildQuery, postJson } from './http.js'

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
