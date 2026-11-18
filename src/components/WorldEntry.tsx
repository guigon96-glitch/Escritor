import { now, updateNode, type BNode } from '../lib/db'
import { useWS } from '../lib/ctx'
import { WORLD_TEMPLATES, templateFor } from '../lib/templates'
import { roleOf } from '../lib/util'
import EntitySheet from './EntitySheet'
import { MultiPick } from './ui'

export default function WorldEntry({ node }: { node: BNode }) {
  const { nodes, select } = useWS()
  const tpl = templateFor(node.template) || WORLD_TEMPLATES[WORLD_TEMPLATES.length - 1]
  const related = nodes.filter(n => n.id !== node.id && !n.deleted && (n.kind === 'world' || n.kind === 'character' || n.kind === 'map') && ['world', 'characters'].includes(roleOf(nodes, n) || '')).map(n => ({ id: n.id, title: `${n.kind === 'character' ? '👤' : templateFor(n.template)?.icon || '🗺'} ${n.title}` }))
  return <EntitySheet node={node} template={tpl}
    header={<div className="row wrap">
      <select value={tpl.key} onChange={e => updateNode(node.id, { template: e.target.value, updatedAt: now() })} title="Tipo de entrada">
        {WORLD_TEMPLATES.map(t => <option key={t.key} value={t.key}>{t.icon} {t.name}</option>)}
      </select>
    </div>}
    extraTabs={[{
      title: 'Ligações', render: () => <div>
        <p className="muted">Ligue esta entrada a personagens, lugares e outros elementos do mundo.</p>
        <MultiPick options={related} value={node.locationIds} placeholder="+ ligar a…" onChange={v => updateNode(node.id, { locationIds: v })} />
        <ul className="mini-list">
          {nodes.filter(n => !n.deleted && n.locationIds.includes(node.id) && n.kind !== 'text').map(n => <li key={n.id}>← <button className="linkish" onClick={() => select(n.id)}>{n.title}</button> <span className="muted">aponta para cá</span></li>)}
        </ul>
      </div>
    }]} />
}
