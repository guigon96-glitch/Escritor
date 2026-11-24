import { useEffect, useRef, useState } from 'react'
import { db } from '../lib/db'

// igu=1 lets Google be shown inside a frame (normally it refuses).
const HOME = 'https://www.google.com/search?igu=1&hl=pt-BR&q='
const toUrl = (q: string) => {
  q = q.trim()
  if (/^https?:\/\//i.test(q)) return q
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(q)) return 'https://' + q
  return HOME + encodeURIComponent(q)
}
// No Windows (Electron) usamos <webview>, que abre qualquer site; no navegador/Android é um iframe,
// e alguns sites recusam ser exibidos dentro de outra página.
const desktop = window.tinteiroNative?.platform === 'desktop'

export default function Browser({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState(HOME)
  const [input, setInput] = useState('')
  const view = useRef<any>(null)

  useEffect(() => { db.kv.get('consultaUrl').then(kv => kv?.value && setUrl(kv.value as string)) }, [])
  const go = (u: string) => {
    if (desktop && view.current?.loadURL) view.current.loadURL(u)
    else setUrl(u)
    db.kv.put({ key: 'consultaUrl', value: u })
  }

  useEffect(() => {
    const w = view.current
    if (!desktop || !w) return
    const nav = (e: any) => { setInput(e.url); db.kv.put({ key: 'consultaUrl', value: e.url }) }
    w.addEventListener('did-navigate', nav)
    w.addEventListener('did-navigate-in-page', nav)
    return () => { w.removeEventListener('did-navigate', nav); w.removeEventListener('did-navigate-in-page', nav) }
  }, [])

  return <div className="browser">
    <form className="browser-bar" onSubmit={e => { e.preventDefault(); if (input.trim()) go(toUrl(input)) }}>
      {desktop && <>
        <button type="button" title="Voltar" onClick={() => view.current?.canGoBack() && view.current.goBack()}>←</button>
        <button type="button" title="Avançar" onClick={() => view.current?.canGoForward() && view.current.goForward()}>→</button>
      </>}
      <button type="button" title="Início (Google)" onClick={() => { setInput(''); go(HOME) }}>⌂</button>
      <input value={input} onChange={e => setInput(e.target.value)} placeholder="Pesquisar ou digitar endereço" />
      <button type="button" title="Abrir no navegador do sistema" onClick={() => window.open(desktop ? view.current?.getURL() || url : url, '_blank')}>↗</button>
      <button type="button" title="Fechar consulta" onClick={onClose}>✕</button>
    </form>
    {desktop
      ? <webview ref={view} src={url} className="browser-view" />
      : <iframe key={url} src={url} className="browser-view" title="Consulta" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />}
  </div>
}

