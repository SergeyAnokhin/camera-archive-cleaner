import { useState, useEffect, useRef } from 'react'
import {
  getGoogleAuthStatus, saveGoogleCredentials, getGoogleAuthUrl,
  disconnectGoogle, googleRedirectUri,
} from '../../api.js'

// Tools → Google tab: connect a Google account for the Gmail Download and
// Drive Upload task types. The OAuth client credentials and tokens are stored
// on the server (background tasks refresh tokens without a browser).
export default function GoogleTab() {
  const [status, setStatus]         = useState(null)
  const [clientId, setClientId]     = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [savedMsg, setSavedMsg]     = useState('')
  const [connecting, setConnecting] = useState(false)
  const [copied, setCopied]         = useState(false)
  const pollRef = useRef(null)

  const redirectUri = googleRedirectUri()

  useEffect(() => {
    getGoogleAuthStatus().then(setStatus).catch(() => setStatus(null))
    return () => clearInterval(pollRef.current)
  }, [])

  async function handleSaveCredentials() {
    setSavedMsg('')
    try {
      const s = await saveGoogleCredentials(clientId, clientSecret)
      setStatus(s)
      setClientSecret('')
      setSavedMsg('Saved')
    } catch (e) {
      setSavedMsg('Error: ' + e.message)
    }
  }

  async function handleConnect() {
    setSavedMsg('')
    try {
      const { url } = await getGoogleAuthUrl()
      window.open(url, '_blank', 'width=520,height=680')
      setConnecting(true)
      // Poll until the OAuth callback lands on the backend
      let attempts = 0
      clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        attempts += 1
        try {
          const s = await getGoogleAuthStatus()
          if (s.connected) {
            setStatus(s)
            setConnecting(false)
            clearInterval(pollRef.current)
          }
        } catch {}
        if (attempts > 60) { setConnecting(false); clearInterval(pollRef.current) }
      }, 2000)
    } catch (e) {
      setSavedMsg('Error: ' + e.message)
    }
  }

  async function handleDisconnect() {
    const s = await disconnectGoogle()
    setStatus(s)
  }

  function copyRedirect() {
    navigator.clipboard?.writeText(redirectUri)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (status === null) return <div className="modal-section">Loading…</div>

  return (
    <>
      <div className="modal-section">
        <div className="modal-section-title">Google account</div>
        <div className="modal-setting-hint">
          Used by the <strong>Gmail Download</strong> and <strong>Drive Upload</strong> task
          types. Connection uses OAuth 2.0 — the password is never entered here; tokens are
          stored on the server so tasks survive restarts.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          {status.connected ? (
            <>
              <span style={{ color: '#34d399' }}>
                <i className="mdi mdi-check-circle" /> Connected{status.email ? `: ${status.email}` : ''}
              </span>
              <button className="modal-btn" onClick={handleDisconnect}>
                <i className="mdi mdi-link-off" /> Disconnect
              </button>
            </>
          ) : (
            <>
              <span style={{ color: 'var(--text-dim)' }}>
                <i className="mdi mdi-circle-outline" /> Not connected
              </span>
              <button className="modal-btn" onClick={handleConnect}
                disabled={!status.client_id_set || connecting}>
                {connecting
                  ? <><i className="mdi mdi-loading mdi-spin" /> Waiting for Google…</>
                  : <><i className="mdi mdi-google" /> Connect Google account</>}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="modal-section">
        <div className="modal-section-title">OAuth client (Google Cloud Console)</div>
        <div className="modal-setting-hint">
          One-time setup: create an OAuth client of type <strong>Web application</strong> in
          {' '}<a href="https://console.cloud.google.com/apis/credentials" target="_blank"
                 rel="noreferrer" style={{ color: 'var(--accent)' }}>Google Cloud Console</a>,
          enable the <strong>Gmail API</strong> and <strong>Drive API</strong>, and add this
          redirect URI:
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
          <code style={{ background: '#1f2937', padding: '4px 8px', borderRadius: 6,
                         fontSize: 'calc(var(--font-base) * 0.85)', wordBreak: 'break-all' }}>
            {redirectUri}
          </code>
          <button className="modal-btn" onClick={copyRedirect} title="Copy">
            <i className={`mdi ${copied ? 'mdi-check' : 'mdi-content-copy'}`} />
          </button>
        </div>
        <div style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
          <input className="modal-text-input" type="text"
            placeholder={status.client_id_set ? 'Client ID (saved — enter to replace)' : 'Client ID'}
            value={clientId} onChange={e => setClientId(e.target.value)} />
          <input className="modal-text-input" type="password"
            placeholder="Client secret"
            value={clientSecret} onChange={e => setClientSecret(e.target.value)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <button className="modal-btn" onClick={handleSaveCredentials}
            disabled={!clientId.trim() || !clientSecret.trim()}>
            <i className="mdi mdi-content-save" /> Save credentials
          </button>
          {savedMsg && <span className="compute-saved">{savedMsg}</span>}
        </div>
      </div>
    </>
  )
}
