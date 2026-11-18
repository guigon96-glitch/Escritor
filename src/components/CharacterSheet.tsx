import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, now, uid, type BNode } from '../lib/db'
import { useWS } from '../lib/ctx'
import { CHARACTER_TEMPLATE, RELATION_TYPES } from '../lib/templates'
import { roleOf } from '../lib/util'
import EntitySheet from './EntitySheet'
import { LazyText } from './ui'

function Relations({ node }: { node: BNode }) {
  const { nodes, project, select } = useWS()
  const rels = useLiveQuery(() => db.relationships.where('projectId').equals(project.id).filter(r => !r.deleted && (r.from === node.id || r.to === node.id)).toArray(), [project.id, node.id]) || []
  const others = nodes.filter(n => n.kind === 'character' && n.id !== node.id && !n.deleted && roleOf(nodes, n) === 'characters')
  const [to, setTo] = useState('')
  const [type, setType] = useState(RELATION_TYPES[0])
  const add = async () => {
    if (!to) return
    await db.relationships.add({ id: uid(), projectId: project.id, from: node.id, to, type, description: '', updatedAt: now() })
    setTo('')
  }
  return <div className="rels">
    <div className="row wrap">
      <select value={to} onChange={e => setTo(e.target.value)}><option value="">Escolha um personagem…</option>{others.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}</select>
      <select value={type} onChange={e => setType(e.target.value)}>{RELATION_TYPES.map(t => <option key={t}>{t}</option>)}</select>
      <button className="primary" onClick={add} disabled={!to}>＋ Relação</button>
    </div>
    {rels.length === 0 && <p className="muted">Sem relações. Elas também aparecem no mapa de Relações.</p>}
    {rels.map(r => {
      const other = nodes.find(n => n.id === (r.from === node.id ? r.to : r.from))
      return <div key={r.id} className="rel-row">
        <div className="rel-who" onClick={() => other && select(other.id)}>
          {other?.image ? <img src={other.image} alt="" /> : <span className="avatar">{other?.title?.[0] || '?'}</span>}
          <strong>{other?.title || '(removido)'}</strong>
        </div>
        <select value={r.type} onChange={e => db.relationships.update(r.id, { type: e.target.value, updatedAt: now() })}>
          {[...new Set([...RELATION_TYPES, r.type])].map(t => <option key={t}>{t}</option>)}
        </select>
        <LazyText value={r.description} rows={1} placeholder="Como é essa relação? Como muda na história?" onCommit={v => db.relationships.update(r.id, { description: v, updatedAt: now() })} />
        <button className="icon" title="Remover" onClick={() => db.relationships.update(r.id, { deleted: true, updatedAt: now() })}>🗑</button>
      </div>
    })}
  </div>
}

function PersonalTimeline({ node }: { node: BNode }) {
  const { project, setTool } = useWS()
  const events = useLiveQuery(() => db.events.where('projectId').equals(project.id).filter(e => !e.deleted && e.characterIds.includes(node.id)).sortBy('sortKey'), [project.id, node.id]) || []
  return <div>
    {events.length === 0 && <p className="muted">Nenhum evento da linha do tempo ligado a este personagem.</p>}
    <ul className="ptl">{events.map(e => <li key={e.id} style={{ borderColor: e.color }}><b>{e.date}</b> {e.title}{e.description && <p className="muted">{e.description}</p>}</li>)}</ul>
    <button onClick={() => setTool('timeline')}>Abrir linha do tempo</button>
  </div>
}

export default function CharacterSheet({ node }: { node: BNode }) {
  const set = (k: string, v: string) => db.nodes.update(node.id, { fields: { ...node.fields, [k]: v }, updatedAt: now() })
  return <EntitySheet node={node} template={CHARACTER_TEMPLATE}
    header={<div className="row wrap">
      <select value={node.fields.role || ''} onChange={e => set('role', e.target.value)}>
        <option value="">Papel…</option>{CHARACTER_TEMPLATE.sections[0].fields.find(f => f.key === 'role')!.options!.map(o => <option key={o}>{o}</option>)}
      </select>
      <select value={node.fields.importance || ''} onChange={e => set('importance', e.target.value)}>
        <option value="">Importância…</option>{['Principal', 'Secundário', 'Terciário', 'Menção'].map(o => <option key={o}>{o}</option>)}
      </select>
      {node.fields.concept && <p className="concept">“{node.fields.concept}”</p>}
    </div>}
    extraTabs={[
      { title: 'Relações', render: () => <Relations node={node} /> },
      { title: 'Linha do tempo', render: () => <PersonalTimeline node={node} /> }
    ]} />
}
