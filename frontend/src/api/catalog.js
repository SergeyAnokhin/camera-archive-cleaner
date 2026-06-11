// /cameras, /scan
import { get, post, buildQuery } from './http.js'

export function getCameras() {
  return get('/cameras')
}

export function getCameraDateRange(cameraId) {
  return get(`/cameras/${encodeURIComponent(cameraId)}/date_range`)
}

export function triggerScan(cameraId = null) {
  return post('/scan' + buildQuery({ camera_id: cameraId }))
}
