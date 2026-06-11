// Stats, file lists, previews, distribution and media/thumbnail URLs.
import { BASE, get, buildQuery } from './http.js'

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

export function getDiffThumbnailUrl(fileId, pageIds, threshold) {
  return `${BASE}/diff_thumbnail/${fileId}?page_ids=${pageIds.join(',')}&threshold=${threshold}`
}

export function getErosionThumbnailUrl(fileId, pageIds, threshold) {
  return `${BASE}/erosion_thumbnail/${fileId}?page_ids=${pageIds.join(',')}&threshold=${threshold}`
}

export function getDistribution(cameraId, dateFrom, dateTo) {
  return get('/distribution' + buildQuery({
    camera_id: cameraId,
    date_from: dateFrom,
    date_to: dateTo,
  }))
}
