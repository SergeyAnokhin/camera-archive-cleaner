// "Select files without objects" — pure logic behind the SelectionBar preset buttons.
// Rule: docs/hour-selection.md. Only YOLO detection results (`aiMap.get(id).detection`) count.
import { COCO_CLASSES } from '../../cocoClasses.js'

// A video belongs to the photos taken within this many seconds of it.
export const VIDEO_MATCH_WINDOW_SEC = 30

function classNames(classIds) {
  const names = new Set()
  for (const c of COCO_CLASSES) {
    if (classIds.includes(c.id)) { names.add(c.en.toLowerCase()); names.add(c.ru.toLowerCase()) }
  }
  return names
}

// Empty `names` means "any object": every non-empty detection counts as a hit.
function hasTarget(objectsStr, names) {
  const words = (objectsStr || '').toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return false
  if (names.size === 0) return true
  const padded = ` ${words.join(' ')} `
  for (const n of names) if (padded.includes(` ${n} `)) return true
  return false
}

/**
 * Pick the files of the current page that contain none of the given objects.
 *
 * - photo: selected only if it was analysed (has a detection row) and the row has no target.
 *   Not analysed ≠ empty, so those are skipped and counted in `unanalyzedPhotos`.
 * - video: has no detection of its own — it follows the photos within ±windowSec.
 *   Selected only if at least one photo is near, and all of them are analysed and clear.
 *   Near a page edge (neighbouring photos live on the adjacent page) it is skipped.
 *
 * @param files      page files, sorted by timestamp
 * @param aiMap      Map file_id → { detection: {objects}|null, ai }
 * @param classIds   COCO class ids to look for; [] = any object
 * @returns { ids: number[], unanalyzedPhotos: number }
 */
export function selectFilesWithoutObjects(files, aiMap, classIds, opts = {}) {
  const { hasPrevPage = false, hasNextPage = false, windowSec = VIDEO_MATCH_WINDOW_SEC } = opts
  const names = classNames(classIds)
  const windowMs = windowSec * 1000
  const time = f => new Date(f.timestamp).getTime()

  const photoStates = []   // { t, state: 'clear' | 'hit' | 'unknown' }
  for (const f of files) {
    if (f.file_type !== 'photo') continue
    const det = aiMap.get(f.id)?.detection
    const state = !det ? 'unknown' : hasTarget(det.objects, names) ? 'hit' : 'clear'
    photoStates.push({ id: f.id, t: time(f), state })
  }
  const stateById = new Map(photoStates.map(p => [p.id, p.state]))

  const firstT = files.length ? time(files[0]) : 0
  const lastT  = files.length ? time(files[files.length - 1]) : 0
  const ids = []
  let unanalyzedPhotos = 0

  for (const f of files) {
    if (f.file_type === 'photo') {
      const s = stateById.get(f.id)
      if (s === 'clear') ids.push(f.id)
      else if (s === 'unknown') unanalyzedPhotos++
      continue
    }
    const t = time(f)
    if (hasPrevPage && t - windowMs < firstT) continue
    if (hasNextPage && t + windowMs > lastT) continue
    const near = photoStates.filter(p => Math.abs(p.t - t) <= windowMs)
    if (near.length > 0 && near.every(p => p.state === 'clear')) ids.push(f.id)
  }
  return { ids, unanalyzedPhotos }
}
