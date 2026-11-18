import { useState } from 'react'
import { db, now, uid, type BNode, type RootRole } from '../lib/db'
import { useWS } from '../lib/ctx'
import { childrenOf, descendants, roleOf, wordsOf, fmt } from '../lib/util'
import { WORLD_TEMPLATES, templateFor } from '../lib/templates'
import { Confirm, Menu } from './ui'

const ROOT_ICON: Record<RootRole, string> = { manuscript: '📖', characters: '👥', world: '🌍', timeline: '🕰', research: '🔬', notes: '🗒', trash: '🗑' }

export function nodeIcon(n: BNode, role?: RootRole): string {
  if (n.kind === 'root') return ROOT_ICON[n.role!]
  if (n.kind === 'folder') return role === 'manuscript' ? '📑' : '📁'
  if (n.kind === 'character') return '👤'
  if (n.kind === 'world') return templateFor(n.template)?.icon || '📘'
  if (n.kind === 'map') return '🗺'
  if (n.kind === 'research') return '📎'
  if (n.kind === 'note') return '🗒'
  return '📄'
}

type DropPos = 'before' | 'after' | 'inside'

export default function Binder() {
  const { nodes, byId, selectedId, select, addNode, trashNode, project } = useWS()
  const [menu, setMenu] = useState<{ x: number; y: number; node: BNode } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [drag, setDrag] = useState<string | null>(null)
  const [drop, setDrop] = useState<{ id: string; pos: DropPos } | null>(null)
  const [worldMenu, setWorldMenu] = useState<{ x: number; y: number; parent: string } | null>(null)
  const [confirm, setConfirm] = useState<{ text: string; yes: () => void } | null>(null)
  const [filter, setFilter] = useState('')

  const roots = nodes.filter(n => n.kind === 'root' && n.role !== 'timeline').sort((a, b) => a.order - b.order)
  const labelColor = (id: string) => project.labels.find(l => l.id === id)?.color

  const sel = selectedId ? byId.get(selectedId) : undefined

  /** Pick a sensible parent for "add" inside a root, based on the current selection. */
  const smartParent = (root: BNode, kind: BNode['kind']): string => {
    if (sel && roleOf(nodes, sel) === root.role) {
      if (sel.kind === 'folder' || sel.kind === 'root') return sel.id
      if (kind !== 'folder' && sel.parentId) return sel.parentId
    }
    if (root.role === 'manuscript' && kind === 'text') {
      const folders = childrenOf(nodes, root.id).filter(n => n.kind === 'folder')
      if (folders.length) return folders[folders.length - 1].id
    }
    return root.id
  }

  const move = async (id: string, targetId: string, pos: DropPos) => {
    if (id === targetId) return
    const target = byId.get(targetId)
    const n = byId.get(id)
    if (!target || !n || n.kind === 'root') return
    if (descendants(nodes, id).some(d => d.id === targetId)) return
    let parentId: string
    let order: number
    if (pos === 'inside' || target.kind === 'root') {
      parentId = target.id
      const kids = childrenOf(nodes, target.id)
      order = kids.length ? kids[kids.length - 1].order + 1 : 0
    } else {
      parentId = target.parentId!
      const sibs = childrenOf(nodes, parentId).filter(s => s.id !== id)
      const idx = sibs.findIndex(s => s.id === targetId)
      const before = pos === 'before' ? sibs[idx - 1] : sibs[idx]
      const after = pos === 'before' ? sibs[idx] : sibs[idx + 1]
      order = before && after ? (before.order + after.order) / 2 : before ? before.order + 1 : after ? after.order - 1 : 0
    }
    await db.nodes.update(id, { parentId, order, updatedAt: now() })
    if (target.kind !== 'root' && pos === 'inside' && !target.expanded) await db.nodes.update(target.id, { expanded: true })
  }

  const shift = async (n: BNode, dir: -1 | 1) => {
    const sibs = childrenOf(nodes, n.parentId!)
    const i = sibs.findIndex(s => s.id === n.id)
    const other = sibs[i + dir]
    if (!other) return
    await db.nodes.update(n.id, { order: other.order, updatedAt: now() })
    await db.nodes.update(other.id, { order: n.order, updatedAt: now() })
  }

  const outdent = async (n: BNode) => {
    const parent = byId.get(n.parentId!)
    if (!parent || parent.kind === 'root') return
    await move(n.id, parent.id, 'after')
  }

  const indent = async (n: BNode) => {
    const sibs = childrenOf(nodes, n.parentId!)
    const i = sibs.findIndex(s => s.id === n.id)
    const prev = sibs[i - 1]
    if (!prev || !['folder', 'text', 'note', 'research'].includes(prev.kind)) return
    await move(n.id, prev.id, 'inside')
  }

  const duplicate = async (n: BNode) => {
    const map = new Map<string, string>()
    const copy = async (src: BNode, parentId: string, order: number, suffix: string) => {
      const id = uid(); map.set(src.id, id)
      await db.nodes.add({ ...src, id, parentId, order, title: src.title + suffix, createdAt: now(), updatedAt: now() })
      for (const c of childrenOf(nodes, src.id)) await copy(c, id, c.order, '')
    }
    await copy(n, n.parentId!, n.order + 0.5, ' (cópia)')
  }

  const restore = async (n: BNode) => {
    const target = n.trashedFrom && byId.get(n.trashedFrom) && roleOf(nodes, byId.get(n.trashedFrom)) !== 'trash' ? n.trashedFrom : roots.find(r => r.role === (n.kind === 'character' ? 'characters' : n.kind === 'world' || n.kind === 'map' ? 'world' : 'manuscript'))!.id
    await db.nodes.update(n.id, { parentId: target, trashedFrom: null, updatedAt: now() })
  }

  const destroy = async (ids: string[]) => {
    // tombstones so the deletion syncs to other devices
    await db.nodes.bulkUpdate(ids.map(id => ({ key: id, changes: { deleted: true, content: '', image: '', updatedAt: now() } })))
  }

  const menuItems = (n: BNode) => {
    const role = roleOf(nodes, n)
    if (n.kind === 'root') {
      if (n.role === 'trash') return [{ label: 'Esvaziar lixeira', danger: true, onClick: () => setConfirm({ text: 'Excluir definitivamente tudo que está na Lixeira?', yes: () => destroy(descendants(nodes, n.id).map(d => d.id)) }) }]
      return [{ label: 'Nova pasta', onClick: () => addNode(n.id, 'folder') }]
    }
    if (role === 'trash') return [
      { label: 'Restaurar', onClick: () => restore(n) },
      { label: 'Excluir definitivamente', danger: true, onClick: () => setConfirm({ text: `Excluir “${n.title}” para sempre?`, yes: () => destroy([n.id, ...descendants(nodes, n.id).map(d => d.id)]) }) }
    ]
    const items: ({ label: string; onClick: () => void; danger?: boolean } | '-')[] = [
      { label: 'Renomear', onClick: () => setRenaming(n.id) }
    ]
    if (n.kind === 'folder') {
      items.push({ label: role === 'manuscript' ? 'Nova cena dentro' : 'Novo item dentro', onClick: () => addNode(n.id, role === 'manuscript' ? 'text' : role === 'characters' ? 'character' : role === 'world' ? 'world' : 'note', role === 'world' ? { template: 'lore' } : {}) })
      items.push({ label: 'Nova subpasta', onClick: () => addNode(n.id, 'folder') })
    }
    if (n.kind === 'text') items.push({ label: 'Nova cena depois desta', onClick: async () => { const id = await addNode(n.parentId!, 'text'); await move(id, n.id, 'after') } })
    items.push('-',
      { label: 'Mover para cima', onClick: () => shift(n, -1) },
      { label: 'Mover para baixo', onClick: () => shift(n, 1) },
      { label: 'Avançar nível (para dentro do anterior)', onClick: () => indent(n) },
      { label: 'Recuar nível', onClick: () => outdent(n) },
      '-',
      { label: 'Duplicar', onClick: () => duplicate(n) },
      { label: 'Mover para a Lixeira', danger: true, onClick: () => trashNode(n.id) })
    return items
  }

  const onDragOver = (e: React.DragEvent, n: BNode) => {
    if (!drag || drag === n.id) return
    e.preventDefault()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = (e.clientY - r.top) / r.height
    const canInside = n.kind === 'root' || n.kind === 'folder' || n.kind === 'text' || n.kind === 'note'
    const pos: DropPos = n.kind === 'root' ? 'inside' : y < 0.3 ? 'before' : y > 0.7 || !canInside ? 'after' : 'inside'
    if (drop?.id !== n.id || drop.pos !== pos) setDrop({ id: n.id, pos })
  }

  const q = filter.trim().toLowerCase()
  const matches = (n: BNode): boolean => !q || n.title.toLowerCase().includes(q) || childrenOf(nodes, n.id).some(matches)

  const renderNode = (n: BNode, depth: number, role: RootRole) => {
    if (!matches(n)) return null
    const kids = childrenOf(nodes, n.id)
    const open = n.kind === 'root' || n.expanded || !!q
    const lc = labelColor(n.labelId)
    return <li key={n.id}>
      <div
        className={'bn' + (n.id === selectedId ? ' sel' : '') + (n.kind === 'root' ? ' root' : '') + (drop?.id === n.id ? ' drop-' + drop.pos : '')}
        style={{ paddingLeft: 6 + depth * 14 }}
        draggable={n.kind !== 'root' && renaming !== n.id}
        onDragStart={e => { setDrag(n.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', n.id) }}
        onDragEnd={() => { setDrag(null); setDrop(null) }}
        onDragOver={e => onDragOver(e, n)}
        onDragLeave={() => setDrop(d => d?.id === n.id ? null : d)}
        onDrop={e => { e.preventDefault(); if (drag && drop) move(drag, drop.id, drop.pos); setDrag(null); setDrop(null) }}
        onClick={() => select(n.id)}
        onDoubleClick={() => n.kind !== 'root' && setRenaming(n.id)}
        onContextMenu={e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, node: n }) }}
      >
        {n.kind !== 'root' && kids.length > 0
          ? <button className="tw" onClick={e => { e.stopPropagation(); db.nodes.update(n.id, { expanded: !n.expanded }) }}>{n.expanded ? '▾' : '▸'}</button>
          : <span className="tw" />}
        {n.kind === 'character' && n.image ? <img className="bn-thumb" src={n.image} alt="" /> : <span className="bn-ic">{nodeIcon(n, role)}</span>}
        {renaming === n.id
          ? <input className="bn-rename" autoFocus defaultValue={n.title} onClick={e => e.stopPropagation()}
            onBlur={e => { db.nodes.update(n.id, { title: e.target.value.trim() || n.title, updatedAt: now() }); setRenaming(null) }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null) }} />
          : <span className="bn-title">{n.title}</span>}
        {lc && <span className="dot" style={{ background: lc }} />}
        {n.kind === 'text' && role === 'manuscript' && <span className="bn-wc">{fmt(wordsOf(n))}</span>}
        {n.kind === 'root' && n.role !== 'trash' && <button className="bn-add" title="Adicionar" onClick={e => {
          e.stopPropagation()
          if (n.role === 'manuscript') addNode(smartParent(n, 'text'), 'text')
          else if (n.role === 'characters') addNode(smartParent(n, 'character'), 'character')
          else if (n.role === 'world') setWorldMenu({ x: e.clientX, y: e.clientY, parent: smartParent(n, 'world') })
          else addNode(smartParent(n, 'note'), n.role === 'research' ? 'research' : 'note')
        }}>＋</button>}
        {n.kind !== 'root' && <button className="bn-more" onClick={e => { e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, node: n }) }}>⋯</button>}
      </div>
      {open && kids.length > 0 && <ul>{kids.map(k => renderNode(k, depth + 1, role))}</ul>}
    </li>
  }

  return <div className="binder">
    <div className="binder-tools">
      <input className="binder-filter" placeholder="Filtrar…" value={filter} onChange={e => setFilter(e.target.value)} />
    </div>
    <div className="binder-quick">
      <button onClick={() => { const r = roots.find(x => x.role === 'manuscript')!; addNode(r.id, 'folder') }}>＋ Capítulo</button>
      <button onClick={() => { const r = roots.find(x => x.role === 'manuscript')!; addNode(smartParent(r, 'text'), 'text') }}>＋ Cena</button>
    </div>
    <ul className="tree">{roots.map(r => renderNode(r, 0, r.role!))}</ul>

    {menu && <Menu x={menu.x} y={menu.y} items={menuItems(menu.node)} onClose={() => setMenu(null)} />}
    {worldMenu && <Menu x={worldMenu.x} y={worldMenu.y} onClose={() => setWorldMenu(null)} items={[
      ...WORLD_TEMPLATES.map(t => ({ label: `${t.icon} ${t.name}`, onClick: () => { addNode(worldMenu.parent, 'world', { template: t.key, title: t.name }) } })),
      '-' as const,
      { label: '🗺 Mapa (imagem com marcadores)', onClick: () => { addNode(worldMenu.parent, 'map', { title: 'Novo mapa' }) } },
      { label: '📁 Pasta', onClick: () => { addNode(worldMenu.parent, 'folder') } }
    ]} />}
    {confirm && <Confirm danger text={confirm.text} yes="Excluir" onNo={() => setConfirm(null)} onYes={() => { confirm.yes(); setConfirm(null) }} />}
  </div>
}
