import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Typography from '@tiptap/extension-typography'
import { db, now, updateNode, type BNode } from '../lib/db'
import { useWS } from '../lib/ctx'
import { childrenOf, descendants, fmt, roleOf, wordsOf } from '../lib/util'
import { nodeIcon } from './Binder'
import { LazyText } from './ui'

function ViewSwitch() {
  const { folderView, setFolderView } = useWS()
  const b = (v: typeof folderView, l: string, t: string) => <button className={folderView === v ? 'on' : ''} onClick={() => setFolderView(v)} title={t}>{l}</button>
  return <div className="seg">
    {b('corkboard', '🗂 Cartões', 'Quadro de cortiça: cada cena é um cartão com sinopse')}
    {b('outliner', '☷ Tabela', 'Esboço em tabela com metadados')}
    {b('scrivenings', '📜 Texto contínuo', 'Lê e edita todas as cenas da pasta em sequência')}
  </div>
}

export default function FolderViews({ node }: { node: BNode }) {
  const { folderView, nodes, addNode } = useWS()
  const role = roleOf(nodes, node)
  const all = descendants(nodes, node.id)
  const total = all.filter(n => n.kind === 'text').reduce((s, n) => s + wordsOf(n), 0)
  return <div className="folder-view">
    <div className="fv-head">
      <div>
        <h2>{node.kind !== 'root' && <span>{nodeIcon(node, role)} </span>}{node.title}</h2>
        <span className="muted">{childrenOf(nodes, node.id).length} itens · {fmt(total)} palavras</span>
      </div>
      <ViewSwitch />
      {role !== 'trash' && <div className="row">
        <button onClick={() => addNode(node.id, role === 'manuscript' ? 'text' : 'note')}>＋ {role === 'manuscript' ? 'Cena' : 'Nota'}</button>
        <button onClick={() => addNode(node.id, 'folder')}>＋ {role === 'manuscript' ? 'Capítulo/pasta' : 'Pasta'}</button>
      </div>}
    </div>
    {node.kind === 'folder' && <div className="fv-synopsis">
      <LazyText value={node.synopsis} rows={2} placeholder={role === 'manuscript' ? 'Resumo do capítulo…' : 'Descrição da pasta…'} onCommit={v => updateNode(node.id, { synopsis: v })} />
    </div>}
    {folderView === 'corkboard' && <Corkboard parent={node} />}
    {folderView === 'outliner' && <Outliner parent={node} />}
    {folderView === 'scrivenings' && <Scrivenings parent={node} />}
  </div>
}

/* ---------------- Corkboard ---------------- */
function Corkboard({ parent }: { parent: BNode }) {
  const { nodes, select, project, byId } = useWS()
  const kids = childrenOf(nodes, parent.id)
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [size, setSize] = useState(220)
  const label = (id: string) => project.labels.find(l => l.id === id)

  const swap = async (k: BNode, d: -1 | 1) => {
    const i = kids.findIndex(x => x.id === k.id)
    const o = kids[i + d]
    if (!o) return
    await db.nodes.update(k.id, { order: o.order, updatedAt: now() })
    await db.nodes.update(o.id, { order: k.order, updatedAt: now() })
  }

  const dropOn = async (targetId: string) => {
    if (!drag || drag === targetId) return
    const list = kids.filter(k => k.id !== drag)
    const idx = list.findIndex(k => k.id === targetId)
    const prev = list[idx - 1]
    const target = list[idx]
    const order = prev ? (prev.order + target.order) / 2 : target.order - 1
    await db.nodes.update(drag, { order, updatedAt: now() })
  }

  return <>
    <div className="cork-tools"><label className="inline muted">Tamanho <input type="range" min={160} max={340} value={size} onChange={e => setSize(+e.target.value)} /></label></div>
    <div className="cork" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` }}>
      {kids.length === 0 && <p className="muted">Pasta vazia. Use os botões acima para criar cenas.</p>}
      {kids.map(k => {
        const l = label(k.labelId)
        const sub = descendants(nodes, k.id).filter(d => d.kind === 'text')
        const wc = k.kind === 'text' ? wordsOf(k) : sub.reduce((s, d) => s + wordsOf(d), 0)
        const pov = k.pov ? byId.get(k.pov) : undefined
        return <div key={k.id} className={'card' + (over === k.id ? ' over' : '')} draggable
          onDragStart={() => setDrag(k.id)} onDragEnd={() => { setDrag(null); setOver(null) }}
          onDragOver={e => { e.preventDefault(); setOver(k.id) }} onDragLeave={() => setOver(null)}
          onDrop={e => { e.preventDefault(); dropOn(k.id); setOver(null) }}>
          <div className="card-stripe" style={{ background: l?.color || 'transparent' }} />
          <div className="card-head" onClick={() => select(k.id)}>
            <span>{nodeIcon(k, 'manuscript')}</span><strong>{k.title}</strong>
          </div>
          <LazyText className="card-syn" value={k.synopsis} rows={4} placeholder="Sinopse da cena…" onCommit={v => updateNode(k.id, { synopsis: v })} />
          <div className="card-foot">
            <span className="card-move">
              <button className="icon" title="Mover para trás" onClick={() => swap(k, -1)}>◀</button>
              <button className="icon" title="Mover para frente" onClick={() => swap(k, 1)}>▶</button>
            </span>
            {k.status && <span className="stamp">{k.status}</span>}
            {pov && <span className="muted" title="Ponto de vista">👁 {pov.title}</span>}
            <span className="muted">{fmt(wc)} pal.</span>
          </div>
        </div>
      })}
    </div>
  </>
}

/* ---------------- Outliner ---------------- */
function Outliner({ parent }: { parent: BNode }) {
  const { nodes, select, project } = useWS()
  const characters = nodes.filter(n => n.kind === 'character' && !n.deleted && roleOf(nodes, n) === 'characters')
  const rows: { n: BNode; depth: number }[] = []
  const walk = (pid: string, d: number) => { for (const c of childrenOf(nodes, pid)) { rows.push({ n: c, depth: d }); walk(c.id, d + 1) } }
  walk(parent.id, 0)
  return <div className="outliner-wrap">
    <table className="outliner">
      <thead><tr><th>Título</th><th>Sinopse</th><th>Rótulo</th><th>Status</th><th>POV</th><th>Data na história</th><th className="num">Palavras</th><th className="num">Meta</th><th title="Incluir na exportação">📕</th></tr></thead>
      <tbody>
        {rows.map(({ n, depth }) => {
          const wc = n.kind === 'text' ? wordsOf(n) : descendants(nodes, n.id).filter(d => d.kind === 'text').reduce((s, d) => s + wordsOf(d), 0)
          return <tr key={n.id} className={n.kind === 'folder' ? 'is-folder' : ''}>
            <td style={{ paddingLeft: 8 + depth * 18 }}><button className="linkish" onClick={() => select(n.id)}>{nodeIcon(n, 'manuscript')} {n.title}</button></td>
            <td><LazyText value={n.synopsis} rows={1} onCommit={v => updateNode(n.id, { synopsis: v })} /></td>
            <td><select value={n.labelId} onChange={e => updateNode(n.id, { labelId: e.target.value })} style={{ borderLeft: `4px solid ${project.labels.find(l => l.id === n.labelId)?.color || 'transparent'}` }}>
              <option value="">—</option>{project.labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></td>
            <td><select value={n.status} onChange={e => updateNode(n.id, { status: e.target.value })}><option value="">—</option>{project.statuses.map(s => <option key={s}>{s}</option>)}</select></td>
            <td><select value={n.pov} onChange={e => updateNode(n.id, { pov: e.target.value })}><option value="">—</option>{characters.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></td>
            <td><input defaultValue={n.storyDate} onBlur={e => e.target.value !== n.storyDate && updateNode(n.id, { storyDate: e.target.value })} /></td>
            <td className="num">{fmt(wc)}</td>
            <td className="num"><input type="number" min={0} defaultValue={n.wordTarget || ''} onBlur={e => updateNode(n.id, { wordTarget: +e.target.value || 0 })} /></td>
            <td><input type="checkbox" checked={n.includeInCompile} onChange={e => updateNode(n.id, { includeInCompile: e.target.checked })} /></td>
          </tr>
        })}
      </tbody>
    </table>
  </div>
}

/* ---------------- Scrivenings (continuous text) ---------------- */
function SceneEditor({ node }: { node: BNode }) {
  const t = useRef<number>(0)
  const pending = useRef<string | null>(null)
  const { recordWords } = useWS()
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false }), TextAlign.configure({ types: ['heading', 'paragraph'] }), Highlight.configure({ multicolor: true }), Typography],
    content: node.content,
    editorProps: { attributes: { spellcheck: 'true', lang: 'pt-BR' } },
    onUpdate: ({ editor }) => {
      pending.current = editor.getHTML()
      clearTimeout(t.current)
      t.current = window.setTimeout(() => { const h = pending.current; pending.current = null; if (h !== null) updateNode(node.id, { content: h }).then(recordWords) }, 700)
    }
  }, [node.id])
  useEffect(() => () => { clearTimeout(t.current); if (pending.current !== null) updateNode(node.id, { content: pending.current }) }, [node.id])
  return <EditorContent editor={editor} />
}

function Scrivenings({ parent }: { parent: BNode }) {
  const { nodes, select, project } = useWS()
  const s = project.settings
  const texts = descendants(nodes, parent.id).filter(n => n.kind === 'text' || n.kind === 'note' || n.kind === 'research' || n.kind === 'folder')
  return <div className={'scriv editor-wrap' + (s.indent ? ' indent' : '')} style={{ '--ed-font': `'${s.fontFamily}', Georgia, serif`, '--ed-size': s.fontSize + 'px', '--ed-lh': String(s.lineHeight), '--ed-width': s.pageWidth + 'px' } as React.CSSProperties}>
    <div className="page">
      {texts.length === 0 && <p className="muted">Nada para mostrar.</p>}
      {texts.map(n => n.kind === 'folder'
        ? <h2 key={n.id} className="scriv-ch" onClick={() => select(n.id)}>{n.title}</h2>
        : <section key={n.id} className="scriv-sec">
          <div className="scriv-title" onClick={() => select(n.id)}>{n.title}</div>
          <SceneEditor node={n} />
        </section>)}
    </div>
  </div>
}
