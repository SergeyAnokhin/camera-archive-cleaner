// Compute-service routing config and probes (Tools → Compute).
import { get, postJson, putJson } from './http.js'

export function getServicesStatus() {
  return get('/services/status')
}

export function getComputeConfig() {
  return get('/compute/config')
}

export function getComputeStatus() {
  return get('/compute/status')
}

export function saveComputeConfig(mode, remoteUrl, remoteUrls = []) {
  return putJson('/compute/config', { mode, remote_url: remoteUrl, remote_urls: remoteUrls })
}

export function pingComputeConfig(mode, remoteUrl) {
  return postJson('/compute/ping', { mode, remote_url: remoteUrl })
}

export function probeComputeUrls(urls) {
  return postJson('/compute/probe-urls', { urls })
}

export function getComputeClientIp() {
  return get('/compute/client-ip')
}

export function discoverCompute() {
  return get('/compute/discover')
}
