// Safe-delete endpoints (/delete/*).
import { postJson } from './http.js'

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
