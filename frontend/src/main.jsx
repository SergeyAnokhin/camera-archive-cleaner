import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App.jsx'
import { getComputeConfig } from './api.js'
import { COMPUTE_MODE_KEY, COMPUTE_URL_KEY } from './components/tools/settingsConfig.js'

// Cache the compute-service routing config so view-mode filtering can read it
// synchronously. The backend (compute_config.json) is the source of truth.
getComputeConfig()
  .then(cfg => {
    localStorage.setItem(COMPUTE_MODE_KEY, cfg.mode)
    localStorage.setItem(COMPUTE_URL_KEY, cfg.remote_url || '')
  })
  .catch(() => {})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
