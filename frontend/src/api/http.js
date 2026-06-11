// Shared HTTP helpers for the api/ domain modules.
export const BASE = 'api'

export async function get(path) {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  return res.json()
}

export async function post(path) {
  const res = await fetch(BASE + path, { method: 'POST' })
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  return res.json()
}

export async function del(path) {
  const res = await fetch(BASE + path, { method: 'DELETE' })
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  return res.json()
}

export function buildQuery(params) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined) q.set(k, v)
  }
  const s = q.toString()
  return s ? '?' + s : ''
}

export async function sendJson(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let msg = `API ${res.status}: ${path}`
    try {
      const j = await res.json()
      if (j.traceback) msg = j.traceback
      else if (j.detail) msg = j.detail
    } catch {}
    throw new Error(msg)
  }
  return res.json()
}

export function postJson(path, body) {
  return sendJson('POST', path, body)
}

export function putJson(path, body) {
  return sendJson('PUT', path, body)
}
