import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useWS } from '../lib/ctx'
import { roleOf } from '../lib/util'

type P = { x: number; y: number }
const W = 1000, H = 700

function relColor(type: string) {
  const t = type.toLowerCase()
  if (/inimigo|rival/.test(t)) return '#c0392b'
  if (/amor|cônjuge|ex/.test(t)) return '#e84393'
  if (/pai|mãe|filho|irmão|família/.test(t)) return '#d35400'
  if (/amig|aliado|mentor/.test(t)) return '#27ae60'
  if (/chefe|subordinado|trabalham/.test(t)) return '#2980b9'
  return '#7f8c8d'
}

export default function RelationMap() {
  const { project, nodes, select } = useWS()
  const chars = useMemo(() => nodes.filter(n => n.kind === 'character' && !n.deleted && roleOf(nodes, n) === 'characters'), [nodes])
  const rels = useLiveQuery(() => db.relationships.where('projectId').equals(project.id).filter(r => !r.deleted).toArray(), [project.id]) || []
  const [pos, setPos] = useState<Record<string, P>>({})
  const [drag, setDrag] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const moved = useRef(false)
  const endDrag = () => {
    if (!drag) return
    if (moved.current) db.kv.put({ key, value: pos })
    else select(drag)
    setDrag(null)
  }
  const key = 'relpos:' + project.id

  useEffect(() => {
    let cancelled = false
    db.kv.get(key).then(kv => {
      if (cancelled) return
      const saved = (kv?.value as Record<string, P>) || {}
      const p: Record<string, P> = {}
      chars.forEach((c, i) => {
        const a = (i / Math.max(1, chars.length)) * Math.PI * 2
        p[c.id] = saved[c.id] || { x: W / 2 + Math.cos(a) * 250, y: H / 2 + Math.sin(a) * 220 }
      })
      const fresh = chars.filter(c => !saved[c.id]).map(c => c.id)
      if (fresh.length) {
        // simple force layout for characters without a saved position
        for (let it = 0; it < 300; it++) {
          for (const id of fresh) {
            let fx = (W / 2 - p[id].x) * 0.01, fy = (H / 2 - p[id].y) * 0.01
            for (const c of chars) {
              if (c.id === id) continue
              const dx = p[id].x - p[c.id].x, dy = p[id].y - p[c.id].y
              const d2 = Math.max(100, dx * dx + dy * dy)
              fx += dx / d2 * 4000; fy += dy / d2 * 4000
            }
            for (const r of rels) {
              const o = r.from === id ? r.to : r.to === id ? r.from : null
              if (!o || !p[o]) continue
              fx += (p[o].x - p[id].x) * 0.02; fy += (p[o].y - p[id].y) * 0.02
            }
            p[id] = { x: Math.min(W - 60, Math.max(60, p[id].x + fx)), y: Math.min(H - 50, Math.max(50, p[id].y + fy)) }
          }
        }
      }
      setPos(p)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chars.length, rels.length, key])

  const toSvg = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }
  }

  if (chars.length === 0) return <div className="empty">Crie personagens e adicione relações na ficha (aba “Relações”) para ver o mapa.</div>

  return <div className="relmap">
    <div className="fv-head">
      <div><h2>🕸 Mapa de relações</h2><span className="muted">Arraste os personagens para organizar. Clique para abrir a ficha.</span></div>
      <div className="legend">
        {[['Família', '#d35400'], ['Amor', '#e84393'], ['Amizade/aliança', '#27ae60'], ['Trabalho', '#2980b9'], ['Conflito', '#c0392b'], ['Outro', '#7f8c8d']].map(([l, c]) => <span key={l}><i style={{ background: c }} />{l}</span>)}
      </div>
    </div>
    <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="relsvg"
      onPointerMove={e => { if (drag) { moved.current = true; setPos(p => ({ ...p, [drag]: toSvg(e) })) } }}
      onPointerUp={endDrag}
      onPointerLeave={() => { if (drag) { if (moved.current) db.kv.put({ key, value: pos }); setDrag(null) } }}>
      <defs>
        {chars.filter(c => c.image).map(c => <clipPath key={c.id} id={'clip-' + c.id}><circle r="30" cx="0" cy="0" /></clipPath>)}
      </defs>
      {rels.map(r => {
        const a = pos[r.from], b = pos[r.to]
        if (!a || !b) return null
        const dim = hover && hover !== r.from && hover !== r.to
        return <g key={r.id} opacity={dim ? 0.15 : 1}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={relColor(r.type)} strokeWidth={3} />
          <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} className="rel-label">{r.type}</text>
        </g>
      })}
      {chars.map(c => {
        const p = pos[c.id]
        if (!p) return null
        const dim = hover && hover !== c.id && !rels.some(r => (r.from === hover && r.to === c.id) || (r.to === hover && r.from === c.id))
        return <g key={c.id} transform={`translate(${p.x},${p.y})`} className="rel-node" opacity={dim ? 0.3 : 1}
          onPointerDown={e => { e.preventDefault(); moved.current = false; setDrag(c.id) }}
          onPointerEnter={() => setHover(c.id)} onPointerLeave={() => setHover(null)}>
          <circle r="32" className="rel-circle" />
          {c.image ? <image href={c.image} x={-30} y={-30} width={60} height={60} clipPath={`url(#clip-${c.id})`} preserveAspectRatio="xMidYMid slice" />
            : <text className="rel-initial" dy="8">{c.title[0]}</text>}
          <text className="rel-name" y={50}>{c.title}</text>
        </g>
      })}
    </svg>
  </div>
}
