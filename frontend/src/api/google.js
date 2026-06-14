// Google account integration endpoints (/google).
import { BASE, get, postJson, putJson, buildQuery } from './http.js'

// The redirect URI the user must register in Google Cloud Console.
// Resolved relative to the current page, same as all API calls.
export function googleRedirectUri() {
  return new URL(BASE + '/google/oauth/callback', window.location.href).href
}

export function getGoogleAuthStatus() {
  return get('/google/auth/status')
}

export function saveGoogleCredentials(clientId, clientSecret) {
  return putJson('/google/auth/credentials', { client_id: clientId, client_secret: clientSecret })
}

export function getGoogleAuthUrl() {
  return get('/google/auth/url' + buildQuery({ redirect_uri: googleRedirectUri() }))
}

export function disconnectGoogle() {
  return postJson('/google/auth/disconnect', {})
}

export function submitManualCallback(url) {
  return postJson('/google/auth/manual_callback', { url })
}

export function getGmailLabels() {
  return get('/google/gmail/labels')
}
