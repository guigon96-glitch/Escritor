import { useState } from 'react'
import type { BNode } from '../lib/db'
import { useWS } from '../lib/ctx'
import { childrenOf, descendants, roleOf } from '../lib/util'
import { WORLD_TEMPLATES, templateFor } from '../lib/templates'
import { mentionsOf } from '../lib/mentions'
import { nodeIcon } from './Binder'

export default function Gallery({ node }: { node: BNode }) {
  const { nodes, select, addNode } = useWS()
  const role = roleOf(nodes, node)!
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('')
  const items = descendants(nodes, node.id).filter(n => n.kind !== 'folder')
  const folders = childrenOf(nodes, node.id).filter(n => n.kind === 'folder')
  const isChars = role === 'characters'
  const groupKey = (n: BNode) => isChars ? (n.fields.importance || 'Sem classificação') : n.kind === 'map' ? 'Mapas' : templateFor(n.template)?.name || 'Outros'
  const filtered = items.filter(n => (!q || (n.title + ' ' + n.aliases + ' ' + Object.values(n.fields).join(' ')).toLowerCase().includes(q.toLowerCase())) && (!group || groupKey(n) === group))
  const groups = [...new Set(items.map(groupKey))]
  const order = isChars ? ['Principal', 'Secundário', 'Terciário', 'Menção', 'Sem classificação'] : [...WORLD_TEMPLATES.map(t => t.name), 'Mapas', 'Outros']
  groups.sort((a, b) => order.indexOf(a) - order.indexOf(b))

  return <div className="gallery">
    <div className="fv-head">
      <div><h2>{nodeIcon(node, role)} {node.title}</h2><span className="muted">{items.length} {isChars ? 'personagens' : 'entradas'}</span></div>
      <div className="row wrap">
        <input placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} />
        <select value={group} onChange={e => setGroup(e.target.value)}><option value="">Todos</option>{groups.map(g => <option key={g}>{g}</option>)}</select>
        {isChars
          ? <button className="primary" onClick={() => addNode(node.id, 'character')}>＋ Personagem</button>
          : <select className="primary" value="" onChange={e => { const v = e.target.value; if (!v) return; v === 'map' ? addNode(node.id, 'map', { title: 'Novo mapa' }) : addNode(node.id, 'world', { template: v, title: templateFor(v)!.name }) }}>
            <option value="">＋ Nova entrada…</option>
            {WORLD_TEMPLATES.map(t => <option key={t.key} value={t.key}>{t.icon} {t.name}</option>)}
            <option value="map">🗺 Mapa</option>
          </select>}
        <button onClick={() => addNode(node.id, 'folder')}>＋ Pasta</button>
      </div>
    </div>
    {folders.length > 0 && <div className="chips">{folders.map(f => <button key={f.id} onClick={() => select(f.id)}>📁 {f.title}</button>)}</div>}
    {items.length === 0 && <div className="empty">{isChars ? 'Crie seu primeiro personagem. A ficha tem identidade, aparência, personalidade, arco, passado, voz e relações.' : 'Construa seu mundo: lugares, povos, religiões, sistemas de magia, facções, criaturas, objetos, idiomas, eventos históricos e mapas.'}</div>}
    {groups.filter(g => filtered.some(n => groupKey(n) === g)).map(g => <section key={g}>
      <h3 className="group-title">{g}</h3>
      <div className="gal-grid">
        {filtered.filter(n => groupKey(n) === g).map(n => {
          const m = mentionsOf(nodes, n).length
          const sub = isChars ? [n.fields.role, n.fields.age && `${n.fields.age} anos`, n.fields.occupation].filter(Boolean).join(' · ') : n.fields.type || templateFor(n.template)?.name
          const blurb = isChars ? n.fields.concept : n.fields.summary || n.synopsis
          return <div key={n.id} className="gal-card" onClick={() => select(n.id)}>
            <div className={'gal-img' + (isChars ? ' round' : '')}>{n.image ? <img src={n.image} alt="" /> : <span>{nodeIcon(n, role)}</span>}</div>
            <div className="gal-txt">
              <strong>{n.title}</strong>
              {sub && <small>{sub}</small>}
              {blurb && <p>{blurb.length > 120 ? blurb.slice(0, 120) + '…' : blurb}</p>}
              <small className="muted">{m ? `Aparece em ${m} cena(s)` : 'Ainda não aparece no texto'}</small>
            </div>
          </div>
        })}
      </div>
    </section>)}
  </div>
}
