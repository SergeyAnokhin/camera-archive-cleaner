// Database/thumbnail cleanup and storage info (Tools → Maintenance).
import { get, post, del, buildQuery } from './http.js'

export function clearDatabase(cameraId = null, dateFrom = null, dateTo = null) {
  return del('/database' + buildQuery({ camera_id: cameraId, date_from: dateFrom, date_to: dateTo }))
}

export function vacuumDatabase() {
  return post('/database/vacuum')
}

export function clearThumbnails(cameraId = null, dateFrom = null, dateTo = null) {
  return del('/thumbnails' + buildQuery({ camera_id: cameraId, date_from: dateFrom, date_to: dateTo }))
}

export function clearDiffThumbnails(cameraId = null, dateFrom = null, dateTo = null) {
  return del('/diff_thumbnails' + buildQuery({ camera_id: cameraId, date_from: dateFrom, date_to: dateTo }))
}

export function clearErosionThumbnails(cameraId = null, dateFrom = null, dateTo = null) {
  return del('/erosion_thumbnails' + buildQuery({ camera_id: cameraId, date_from: dateFrom, date_to: dateTo }))
}

export function clearVideoThumbnails(cameraId = null, dateFrom = null, dateTo = null) {
  return del('/video_thumbnails' + buildQuery({ camera_id: cameraId, date_from: dateFrom, date_to: dateTo }))
}

export function clearOpenVinoThumbnails(cameraId = null, dateFrom = null, dateTo = null) {
  return del('/openvino_thumbnails' + buildQuery({ camera_id: cameraId, date_from: dateFrom, date_to: dateTo }))
}

export function clearAllThumbnails(cameraId = null, dateFrom = null, dateTo = null) {
  return del('/all_thumbnails' + buildQuery({ camera_id: cameraId, date_from: dateFrom, date_to: dateTo }))
}

export function getStorageInfo() {
  return get('/storage_info')
}
