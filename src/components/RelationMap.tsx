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
  const [all, setAll] = useState(false)
  const related = useMemo(() => new Set(rels.flatMap(r => [r.from, r.to])), [rels])
  const shown = useMemo(() => all ? chars : chars.filter(c => related.has(c.id)), [all, chars, related])
  const [pos, setPos] = useState<Record<string, P>>({})
  const [nonce, setNonce] = useState(0)
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
      // layout circular: ordena por conexões (BFS a partir do mais conectado) para que vizinhos fiquem próximos
      const deg = new Map<string, number>()
      rels.forEach(r => { deg.set(r.from, (deg.get(r.from) || 0) + 1); deg.set(r.to, (deg.get(r.to) || 0) + 1) })
      const order: string[] = []
      const seen = new Set<string>()
      const byDeg = [...shown].sort((x, y) => (deg.get(y.id) || 0) - (deg.get(x.id) || 0))
      for (const start of byDeg) {
        if (seen.has(start.id)) continue
        const queue = [start.id]
        seen.add(start.id)
        while (queue.length) {
          const id = queue.shift()!
          order.push(id)
          const nb = rels.filter(r => r.from === id || r.to === id).map(r => r.from === id ? r.to : r.from)
            .filter(n => !seen.has(n) && shown.some(c => c.id === n))
            .sort((x, y) => (deg.get(y) || 0) - (deg.get(x) || 0))
          nb.forEach(n => { seen.add(n); queue.push(n) })
        }
      }
      order.forEach((id, i) => {
        const ang = (i / Math.max(1, order.length)) * Math.PI * 2 - Math.PI / 2
        p[id] = saved[id] || { x: W / 2 + Math.cos(ang) * (W / 2 - 90), y: H / 2 + Math.sin(ang) * (H / 2 - 70) }
      })
      setPos(p)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.length, rels.length, key, nonce])

  const toSvg = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }
  }

  if (chars.length === 0) return <div className="empty">Crie personagens e adicione relações na ficha (aba “Relações”) para ver o mapa.</div>

  return <div className="relmap">
    <div className="fv-head">
      <div><h2>🕸 Mapa de relações</h2><span className="muted">Arraste os personagens para organizar. Clique para abrir a ficha.</span></div>
      <label className="inline"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} /> mostrar também quem não tem relações ({chars.length - related.size})</label>
      <button onClick={async () => { await db.kv.delete(key); setNonce(n => n + 1) }} title="Recalcular a posição de todos">↺ Reorganizar</button>
      <div className="legend">
        {[['Família', '#d35400'], ['Amor', '#e84393'], ['Amizade/aliança', '#27ae60'], ['Trabalho', '#2980b9'], ['Conflito', '#c0392b'], ['Outro', '#7f8c8d']].map(([l, c]) => <span key={l}><i style={{ background: c }} />{l}</span>)}
      </div>
    </div>
    <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="relsvg"
      onPointerMove={e => { if (drag) { moved.current = true; setPos(p => ({ ...p, [drag]: toSvg(e) })) } }}
      onPointerUp={endDrag}
      onPointerLeave={() => { if (drag) { if (moved.current) db.kv.put({ key, value: pos }); setDrag(null) } }}>
      <defs>
        {shown.filter(c => c.image).map(c => <clipPath key={c.id} id={'clip-' + c.id}><circle r="30" cx="0" cy="0" /></clipPath>)}
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
      {shown.map(c => {
        const p = pos[c.id]
        if (!p) return null
        const dim = hover && hover !== c.id && !rels.some(r => (r.from === hover && r.to === c.id) || (r.to === hover && r.from === c.id))
        return <g key={c.id} transform={`translate(${p.x},${p.y})`} className="rel-node" opacity={dim ? 0.3 : 1}
          onPointerDown={e => { e.preventDefault(); moved.current = false; setDrag(c.id) }}
          onPointerEnter={() => setHover(c.id)} onPointerLeave={() => setHover(null)}>
          <circle r="32" className="rel-circle" />
          {c.image ? <image href={c.image} x={-30} y={-30} width={60} height={60} clipPath={`url(#clip-${c.id})`} preserveAspectRatio="xMidYMid slice" />
            : <text className="rel-initial" dy="8">{c.title[0]}</text>}
          <text className="rel-name" y={50}>{c.title.length > 18 ? c.title.split(' ')[0] : c.title}</text>
        </g>
      })}
    </svg>
  </div>
}
