// /cameras, /scan
import { get, post, putJson, postJson, buildQuery } from './http.js'

export function getCameras() {
  return get('/cameras')
}

export function getCameraDateRange(cameraId) {
  return get(`/cameras/${encodeURIComponent(cameraId)}/date_range`)
}

export function triggerScan(cameraId = null) {
  return post('/scan' + buildQuery({ camera_id: cameraId }))
}

export function getCamerasConfig() {
  return get('/cameras/config')
}

export function saveCamerasConfig(cameras) {
  return putJson('/cameras/config', cameras)
}

export function checkCameraPath(path) {
  return postJson('/cameras/check-path', { path })
}
