import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import './appshell.css'
import App from './App.jsx'

// The bare `<script>` vite-plugin-pwa injects automatically only calls
// navigator.serviceWorker.register() — it has no idea a new version ever
// shipped, so it can't do anything about it. This is what actually detects
// an update and reloads once the new worker (which now skips waiting
// immediately — see src/sw.js) takes over, which is the piece
// `registerType: 'autoUpdate'` needs to mean anything in practice.
registerSW({ immediate: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
