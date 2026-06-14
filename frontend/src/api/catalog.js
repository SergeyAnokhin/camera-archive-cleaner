// /cameras, /scan, /camera_root, /media_dirs
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

export function getCameraRoot() {
  return get('/camera_root')
}

export function putCameraRoot(camera_root) {
  return putJson('/camera_root', { camera_root })
}

export function getMediaDirs() {
  return get('/media_dirs')
}
