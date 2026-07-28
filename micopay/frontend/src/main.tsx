import React from 'react'
import ReactDOM from 'react-dom/client'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import App from './App'
import ClaimQR from './pages/ClaimQR'
import './index.css'
import './i18n'

// Android hardware back button → browser history. Plays well with HashRouter.
// On native iOS/web this listener simply doesn't fire (no-op).
if (Capacitor.isNativePlatform()) {
  CapApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back()
    } else {
      CapApp.exitApp()
    }
  })

  // Status bar branding — match the white header backdrop with dark icons.
  // Lazy-imported so the plugin only ships in native bundles.
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    // Don't draw the WebView under the status bar. On Android env(safe-area-inset-top)
    // is 0, so an overlaying status bar would sit on top of our fixed headers
    // (title colliding with the clock/icons). overlay:false reserves the bar.
    StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {})
    StatusBar.setStyle({ style: Style.Light }).catch(() => {})
    StatusBar.setBackgroundColor({ color: '#FFFFFF' }).catch(() => {})
  }).catch(() => {})
}

// External claim links: /claim/:requestId
// Any AI agent (Claude, GPT, WhatsApp bot...) sends users here to show the QR
const claimMatch = window.location.pathname.match(/^\/claim\/([a-zA-Z0-9_-]+)$/)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {claimMatch ? (
      <ClaimQR requestId={claimMatch[1]} />
    ) : (
      <App />
    )}
  </React.StrictMode>,
)
