import { useState } from 'react'
import { uid, updateNode, type BNode, type Pin } from '../lib/db'
import { useWS } from '../lib/ctx'
import { imageToDataUrl, pickFile, roleOf } from '../lib/util'
import { templateFor } from '../lib/templates'
import { LazyInput, LazyText, toast } from './ui'

export default function MapView({ node }: { node: BNode }) {
  const { nodes, select } = useWS()
  const [adding, setAdding] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const [zoom, setZoom] = useState(100)
  const targets = nodes.filter(n => !n.deleted && (n.kind === 'world' || n.kind === 'character') && ['world', 'characters'].includes(roleOf(nodes, n) || ''))

  const upload = async () => {
    const f = await pickFile('image/*')
    if (!f) return
    try { await updateNode(node.id, { image: await imageToDataUrl(f, 2400, 0.88) }) } catch { toast('Imagem inválida', 'err') }
  }
  const setPins = (pins: Pin[]) => updateNode(node.id, { pins })
  const pin = active ? node.pins.find(p => p.id === active) : undefined

  return <div className="mapview">
    <div className="fv-head">
      <input className="big-title" value={node.title} onChange={e => updateNode(node.id, { title: e.target.value })} />
      <div className="row wrap">
        <button onClick={upload}>🖼 {node.image ? 'Trocar imagem' : 'Carregar imagem do mapa'}</button>
        {node.image && <button className={adding ? 'on primary' : ''} onClick={() => setAdding(a => !a)}>📍 {adding ? 'Toque no mapa…' : 'Adicionar marcador'}</button>}
        {node.image && <label className="inline muted">Zoom <input type="range" min={50} max={300} value={zoom} onChange={e => setZoom(+e.target.value)} /></label>}
      </div>
    </div>
    {!node.image && <div className="empty">Carregue uma imagem (desenho, mapa escaneado, gerado em outro app…) e marque os lugares importantes.</div>}
    {node.image && <div className="map-scroll">
      <div className="map-inner" style={{ width: zoom + '%' }} onClick={e => {
        if (!adding) { setActive(null); return }
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const p: Pin = { id: uid(), x: (e.clientX - r.left) / r.width * 100, y: (e.clientY - r.top) / r.height * 100, label: 'Novo local' }
        setPins([...node.pins, p]); setAdding(false); setActive(p.id)
      }}>
        <img src={node.image} alt={node.title} draggable={false} />
        {node.pins.map(p => {
          const t = p.nodeId ? nodes.find(n => n.id === p.nodeId) : undefined
          return <button key={p.id} className={'pin' + (active === p.id ? ' on' : '')} style={{ left: p.x + '%', top: p.y + '%' }}
            onClick={e => { e.stopPropagation(); setActive(p.id) }}>
            <span className="pin-dot">{t?.kind === 'character' ? '👤' : t ? templateFor(t.template)?.icon || '📍' : '📍'}</span>
            <span className="pin-label">{p.label}</span>
          </button>
        })}
      </div>
    </div>}
    {pin && <div className="pin-panel">
      <LazyInput value={pin.label} onCommit={v => setPins(node.pins.map(p => p.id === pin.id ? { ...p, label: v } : p))} />
      <select value={pin.nodeId || ''} onChange={e => setPins(node.pins.map(p => p.id === pin.id ? { ...p, nodeId: e.target.value || undefined, label: p.label === 'Novo local' && e.target.value ? targets.find(t => t.id === e.target.value)!.title : p.label } : p))}>
        <option value="">Ligar a uma entrada…</option>
        {targets.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
      </select>
      {pin.nodeId && <button onClick={() => select(pin.nodeId!)}>Abrir ficha</button>}
      <button className="danger" onClick={() => { setPins(node.pins.filter(p => p.id !== pin.id)); setActive(null) }}>Remover</button>
      <button className="icon" onClick={() => setActive(null)}>✕</button>
    </div>}
    <div className="pad"><LazyText value={node.synopsis} rows={2} placeholder="Legenda / descrição do mapa" onCommit={v => updateNode(node.id, { synopsis: v })} /></div>
  </div>
}
