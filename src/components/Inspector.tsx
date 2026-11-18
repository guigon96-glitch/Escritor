import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { diffWords } from 'diff'
import { db, now, uid, updateNode, type BNode, type Snapshot } from '../lib/db'
import { useWS } from '../lib/ctx'
import { fmtDate, htmlToText, roleOf, wordsOf, fmt } from '../lib/util'
import { mentionsOf } from '../lib/mentions'
import { LazyInput, LazyText, Modal, MultiPick, TagInput, toast, Confirm } from './ui'

export default function Inspector({ onClose }: { onClose: () => void }) {
  const { selectedId, byId, nodes } = useWS()
  const n = selectedId ? byId.get(selectedId) : undefined
  if (!n || n.kind === 'root') return <div className="inspector"><div className="insp-head"><h3>Inspetor</h3><button className="icon" onClick={onClose}>✕</button></div><p className="muted pad">Selecione uma cena, personagem ou entrada.</p></div>
  const role = roleOf(nodes, n)
  return <div className="inspector">
    <div className="insp-head"><h3>Inspetor</h3><button className="icon" onClick={onClose}>✕</button></div>
    {(n.kind === 'text' || n.kind === 'folder' || n.kind === 'note' || n.kind === 'research') && <SceneMeta n={n} manuscript={role === 'manuscript'} />}
    {(n.kind === 'character' || n.kind === 'world' || n.kind === 'map') && <EntityMeta n={n} />}
    {(n.kind === 'text' || n.kind === 'note' || n.kind === 'research') && <Snapshots n={n} />}
  </div>
}

function SceneMeta({ n, manuscript }: { n: BNode; manuscript: boolean }) {
  const { project, nodes } = useWS()
  const characters = nodes.filter(x => x.kind === 'character' && !x.deleted && roleOf(nodes, x) === 'characters').map(c => ({ id: c.id, title: c.title }))
  const places = nodes.filter(x => (x.kind === 'world' || x.kind === 'map') && !x.deleted && roleOf(nodes, x) === 'world').map(c => ({ id: c.id, title: c.title }))
  const words = n.kind === 'text' ? wordsOf(n) : 0
  return <div className="insp-sec">
    <label>Sinopse<LazyText value={n.synopsis} rows={3} placeholder="O que acontece aqui, em poucas linhas" onCommit={v => updateNode(n.id, { synopsis: v })} /></label>
    {manuscript && <>
      <div className="grid2">
        <label>Rótulo
          <select value={n.labelId} onChange={e => updateNode(n.id, { labelId: e.target.value })}>
            <option value="">—</option>{project.labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label>Status
          <select value={n.status} onChange={e => updateNode(n.id, { status: e.target.value })}>
            <option value="">—</option>{project.statuses.map(s => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <label>Ponto de vista (POV)
        <select value={n.pov} onChange={e => updateNode(n.id, { pov: e.target.value })}>
          <option value="">—</option>{characters.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </label>
      <label>Personagens na cena<MultiPick options={characters} value={n.characterIds} placeholder="+ adicionar" onChange={v => updateNode(n.id, { characterIds: v })} /></label>
      <label>Lugares / elementos do mundo<MultiPick options={places} value={n.locationIds} placeholder="+ adicionar" onChange={v => updateNode(n.id, { locationIds: v })} /></label>
      <label>Data / momento na história<LazyInput value={n.storyDate} placeholder="Ex.: Dia 3, manhã · Ano 1042" onCommit={v => updateNode(n.id, { storyDate: v })} /></label>
      {n.kind === 'text' && <div className="grid2">
        <label>Meta de palavras<LazyInput type="number" value={String(n.wordTarget || '')} onCommit={v => updateNode(n.id, { wordTarget: +v || 0 })} /></label>
        <label>Atual<input disabled value={fmt(words)} /></label>
      </div>}
      <label className="inline"><input type="checkbox" checked={n.includeInCompile} onChange={e => updateNode(n.id, { includeInCompile: e.target.checked })} /> Incluir na exportação</label>
    </>}
    <label>Palavras‑chave<TagInput value={n.keywords} placeholder="+ tag e Enter" onChange={v => updateNode(n.id, { keywords: v })} /></label>
    <label>Anotações do documento<LazyText value={n.notes} rows={6} placeholder="Ideias, pendências, pesquisa para esta cena…" onCommit={v => updateNode(n.id, { notes: v })} /></label>
  </div>
}

function EntityMeta({ n }: { n: BNode }) {
  const { nodes, select, project } = useWS()
  const mentions = mentionsOf(nodes, n)
  const rels = useLiveQuery(() => db.relationships.where('projectId').equals(project.id).filter(r => !r.deleted && (r.from === n.id || r.to === n.id)).toArray(), [project.id, n.id])
  const total = mentions.reduce((s, m) => s + m.count, 0)
  return <div className="insp-sec">
    <label>Outros nomes / apelidos (separados por vírgula)
      <LazyInput value={n.aliases} placeholder="Usados para achar menções no texto" onCommit={v => updateNode(n.id, { aliases: v })} />
    </label>
    <label>Palavras‑chave<TagInput value={n.keywords} placeholder="+ tag e Enter" onChange={v => updateNode(n.id, { keywords: v })} /></label>
    {n.kind === 'character' && <div>
      <h4>Relações</h4>
      {rels?.length === 0 && <p className="muted">Nenhuma. Adicione na aba Relações da ficha.</p>}
      <ul className="mini-list">{rels?.map(r => {
        const other = nodes.find(x => x.id === (r.from === n.id ? r.to : r.from))
        return <li key={r.id}><button className="linkish" onClick={() => other && select(other.id)}>{other?.title || '?'}</button> <span className="muted">— {r.type}</span></li>
      })}</ul>
    </div>}
    <h4>Aparece no manuscrito</h4>
    <p className="muted">{mentions.length} cena(s){total ? ` · ${total} menção(ões) pelo nome` : ''}</p>
    <ul className="mini-list">
      {mentions.map(m => <li key={m.scene.id}>
        <button className="linkish" onClick={() => select(m.scene.id)}>{m.scene.title}</button>
        <span className="muted"> {m.pov ? '👁 POV ' : ''}{m.tagged ? '🏷 ' : ''}{m.count ? `×${m.count}` : ''}</span>
      </li>)}
    </ul>
    <label>Anotações<LazyText value={n.notes} rows={5} onCommit={v => updateNode(n.id, { notes: v })} /></label>
  </div>
}

function Snapshots({ n }: { n: BNode }) {
  const snaps = useLiveQuery(() => db.snapshots.where('nodeId').equals(n.id).reverse().sortBy('createdAt'), [n.id])
  const [view, setView] = useState<Snapshot | null>(null)
  const [restore, setRestore] = useState<Snapshot | null>(null)
  const take = async (title?: string) => {
    const t = now()
    await db.snapshots.add({ id: uid(), projectId: n.projectId, nodeId: n.id, title: title || 'Snapshot', content: n.content, createdAt: t, updatedAt: t })
    toast('Snapshot salvo')
  }
  const list = snaps?.filter(s => !s.deleted) || []
  return <div className="insp-sec">
    <h4>Snapshots (versões)</h4>
    <p className="muted">Guarde uma versão antes de revisar. Você pode comparar e voltar a qualquer uma.</p>
    <div className="row"><button onClick={() => { const t = prompt('Nome do snapshot', `Versão de ${new Date().toLocaleDateString('pt-BR')}`); if (t !== null) take(t) }}>📸 Tirar snapshot</button></div>
    <ul className="mini-list">
      {list.map(s => <li key={s.id}>
        <button className="linkish" onClick={() => setView(s)}>{s.title}</button><br />
        <small className="muted">{fmtDate(s.createdAt)} · {fmt(wordsOf(s))} pal.</small>
      </li>)}
    </ul>
    {view && <Modal wide title={`Comparar: ${view.title}`} onClose={() => setView(null)} footer={<>
      <button className="danger" onClick={async () => { await db.snapshots.update(view.id, { deleted: true, content: '', updatedAt: now() }); setView(null) }}>Excluir snapshot</button>
      <button className="primary" onClick={() => setRestore(view)}>Restaurar esta versão</button>
    </>}>
      <p className="muted"><span className="diff-del">removido desde o snapshot</span> · <span className="diff-add">adicionado depois</span></p>
      <div className="diff">{diffWords(htmlToText(view.content), htmlToText(n.content)).map((p, i) =>
        <span key={i} className={p.added ? 'diff-add' : p.removed ? 'diff-del' : ''}>{p.value}</span>)}</div>
    </Modal>}
    {restore && <Confirm text="O texto atual será substituído por esta versão. Antes disso, um snapshot do texto atual será salvo automaticamente." yes="Restaurar"
      onNo={() => setRestore(null)}
      onYes={async () => { await take('Antes de restaurar'); await updateNode(n.id, { content: restore.content }); setRestore(null); setView(null); toast('Versão restaurada') }} />}
  </div>
}
