import { useEffect, useRef, useState } from 'react'
import { db } from '../lib/db'
import { Menu } from './ui'

type Fav = { title: string; url: string }

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
  const [cur, setCur] = useState(HOME)
  const [favs, setFavs] = useState<Fav[]>([])
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const view = useRef<any>(null)

  useEffect(() => {
    db.kv.get('consultaUrl').then(kv => { if (kv?.value) { setUrl(kv.value as string); setCur(kv.value as string) } })
    db.kv.get('consultaFavs').then(kv => kv?.value && setFavs(kv.value as Fav[]))
  }, [])
  const saveFavs = (f: Fav[]) => { setFavs(f); db.kv.put({ key: 'consultaFavs', value: f }) }
  const isFav = favs.some(f => f.url === cur)
  const toggleFav = () => {
    if (isFav) return saveFavs(favs.filter(f => f.url !== cur))
    let title = desktop ? view.current?.getTitle?.() : ''
    if (!title) { try { const u = new URL(cur); title = u.searchParams.get('q') || u.hostname } catch { title = cur } }
    saveFavs([...favs, { title, url: cur }])
  }
  const go = (u: string) => {
    if (desktop && view.current?.loadURL) view.current.loadURL(u)
    else setUrl(u)
    setCur(u)
    db.kv.put({ key: 'consultaUrl', value: u })
  }

  useEffect(() => {
    const w = view.current
    if (!desktop || !w) return
    const nav = (e: any) => { setInput(e.url); setCur(e.url); db.kv.put({ key: 'consultaUrl', value: e.url }) }
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
      <button type="button" className={isFav ? 'on' : ''} title={isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} onClick={toggleFav}>{isFav ? '★' : '☆'}</button>
      <button type="button" title="Favoritos" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.bottom + 4 }) }}>▾</button>
      <button type="button" title="Abrir no navegador do sistema" onClick={() => window.open(desktop ? view.current?.getURL() || url : url, '_blank')}>↗</button>
      <button type="button" title="Fechar consulta" onClick={onClose}>✕</button>
    </form>
    {menu && <Menu x={menu.x} y={menu.y} onClose={() => setMenu(null)} items={favs.length
      ? favs.map(f => ({ label: '★ ' + f.title, onClick: () => { setInput(f.url); go(f.url) } }))
      : [{ label: 'Nenhum favorito ainda — use ☆ para adicionar', onClick: () => {} }]} />}
    {desktop
      ? <webview ref={view} src={url} className="browser-view" />
      : <iframe key={url} src={url} className="browser-view" title="Consulta" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />}
  </div>
}

