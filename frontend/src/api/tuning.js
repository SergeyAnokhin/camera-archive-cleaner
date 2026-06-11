// Model tuning sessions (/tuning/sessions/*).
import { BASE, get, sendJson, postJson, putJson } from './http.js'

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
