// /settings GET/PUT
import { get, putJson } from './http.js'

export function getSettings() {
  return get('/settings')
}

export function saveSettings(settings) {
  return putJson('/settings', settings)
}
