import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/literata/latin-400.css'
import '@fontsource/literata/latin-400-italic.css'
import '@fontsource/literata/latin-600.css'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import App from './App'
import { setupNative } from './lib/native'
import './styles.css'

setupNative()

// Offline cache (web/tablet). The Windows app ships its files locally and doesn't need it.
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !(window as any).tinteiroNative) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}))
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
