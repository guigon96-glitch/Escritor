import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { blankNode, createProject, db } from '../lib/db'
import { connectDrive, downloadRemote, importAsCopy, ensureSession, listRemoteProjects, mergeBundle, type Bundle, type RemoteProject } from '../lib/sync'
import { importDocx, splitByHeadings } from '../lib/docx'
import { fmtDate, pickFile, rootByRole } from '../lib/util'
import { Confirm, LazyInput, Modal, toast } from './ui'
import DriveSetup from './DriveSetup'

export default function ProjectList({ onOpen }: { onOpen: (id: string) => void }) {
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().filter(p => !p.deleted).toArray(), [])
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', author: '', genre: '' })
  const [remote, setRemote] = useState<RemoteProject[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [setup, setSetup] = useState(false)
  const [delId, setDelId] = useState<string | null>(null)

  const create = async () => {
    if (!form.title.trim()) return
    const id = await createProject(form.title.trim(), form.author.trim(), form.genre.trim())
    onOpen(id)
  }

  const importDoc = async () => {
    const f = await pickFile('.docx')
    if (!f) return
    setBusy(true)
    try {
      const html = await importDocx(f)
      const title = f.name.replace(/\.docx$/i, '')
      const id = await createProject(title, '', '')
      const all = await db.nodes.where('projectId').equals(id).toArray()
      const ms = rootByRole(all, 'manuscript')!
      // remove the sample chapter
      await db.nodes.bulkDelete(all.filter(n => n.kind !== 'root').map(n => n.id))
      const parts = splitByHeadings(html, title)
      let i = 0
      for (const p of parts) {
        const ch = blankNode({ projectId: id, kind: 'folder', parentId: ms.id, title: p.title, order: i })
        await db.nodes.add(ch)
        await db.nodes.add(blankNode({ projectId: id, kind: 'text', parentId: ch.id, title: p.title, content: p.html, order: i++, status: 'Rascunho' }))
      }
      toast(`Importado: ${parts.length} capítulo(s)`)
      onOpen(id)
    } catch (e: any) { toast('Falha ao importar: ' + e.message, 'err') } finally { setBusy(false) }
  }

  const restore = async () => {
    const f = await pickFile('.json')
    if (!f) return
    try {
      const b = JSON.parse(await f.text()) as Bundle
      const exists = await db.projects.get(b.project.id)
      let id = b.project.id
      if (exists) id = await importAsCopy(b)
      else await mergeBundle(b)
      toast(exists ? 'Backup restaurado como cópia' : 'Projeto restaurado')
      onOpen(id)
    } catch (e: any) { toast('Arquivo inválido: ' + e.message, 'err') }
  }

  const loadDrive = async () => {
    setBusy(true)
    try {
      if (!(await ensureSession())) await connectDrive()
      setRemote(await listRemoteProjects())
    } catch (e: any) {
      if (String(e.message).includes('Client ID')) setSetup(true)
      else toast(e.message, 'err')
    } finally { setBusy(false) }
  }

  const fetchRemote = async (r: RemoteProject) => {
    setBusy(true)
    try { const id = await downloadRemote(r.id); onOpen(id) } catch (e: any) { toast(e.message, 'err') } finally { setBusy(false) }
  }

  const localIds = new Set(projects?.map(p => p.id))

  return <div className="home">
    <header className="home-head">
      <div className="brand"><img src="icon.svg" alt="" /><div><h1>Tinteiro</h1><p>Seu escritório de escrita</p></div></div>
      <div className="row">
        <button onClick={() => setSetup(true)}>⚙ Google Drive</button>
      </div>
    </header>

    <section className="home-actions">
      <button className="big primary" onClick={() => setCreating(true)}>＋ Novo livro</button>
      <button className="big" onClick={importDoc} disabled={busy}>📄 Importar .docx</button>
      <button className="big" onClick={loadDrive} disabled={busy}>☁ Abrir do Google Drive</button>
      <button className="big" onClick={restore}>🗂 Restaurar backup (.json)</button>
    </section>

    <section className="project-grid">
      {projects?.length === 0 && <p className="muted">Nenhum livro ainda. Crie o primeiro ou importe um arquivo do Word.</p>}
      {projects?.map(p => <div key={p.id} className="project-card" onClick={() => onOpen(p.id)}>
        <div className="spine" />
        <div className="pc-body">
          <h3>{p.title}</h3>
          <p>{p.author || 'Autor(a)'}{p.genre ? ' · ' + p.genre : ''}</p>
          <small>Editado em {fmtDate(p.updatedAt)}{p.driveFileId ? ' · ☁ sincronizado' : ''}</small>
        </div>
        <button className="icon pc-del" title="Excluir" onClick={e => { e.stopPropagation(); setDelId(p.id) }}>🗑</button>
      </div>)}
    </section>

    {creating && <Modal title="Novo livro" onClose={() => setCreating(false)} footer={<><button onClick={() => setCreating(false)}>Cancelar</button><button className="primary" onClick={create}>Criar</button></>}>
      <label>Título<LazyInput autoFocus value={form.title} onCommit={v => setForm(f => ({ ...f, title: v }))} /></label>
      <label>Autor(a)<LazyInput value={form.author} onCommit={v => setForm(f => ({ ...f, author: v }))} /></label>
      <label>Gênero<LazyInput value={form.genre} placeholder="Fantasia, romance, suspense…" onCommit={v => setForm(f => ({ ...f, genre: v }))} /></label>
    </Modal>}

    {remote && <Modal title="Livros no Google Drive" onClose={() => setRemote(null)}>
      {remote.length === 0 && <p className="muted">Nenhum livro sincronizado ainda. Abra um livro e toque em “Sincronizar”.</p>}
      <ul className="list">
        {remote.map(r => <li key={r.id}>
          <div><strong>{r.name.replace('.tinteiro.json', '')}</strong><br /><small>{fmtDate(Date.parse(r.modifiedTime))}</small></div>
          <button className="primary" disabled={busy} onClick={() => fetchRemote(r)}>{localIds.has(r.projectId) ? 'Atualizar e abrir' : 'Baixar'}</button>
        </li>)}
      </ul>
    </Modal>}

    {setup && <DriveSetup onClose={() => setSetup(false)} />}

    {delId && <Confirm danger yes="Excluir deste aparelho" text="O livro será removido deste aparelho. A cópia no Google Drive (se houver) continua lá e pode ser baixada de novo. Recomendo baixar um backup antes."
      onNo={() => setDelId(null)}
      onYes={async () => {
        const id = delId; setDelId(null)
        await db.transaction('rw', [db.projects, db.nodes, db.snapshots, db.events, db.relationships, db.stats], async () => {
          await db.projects.delete(id)
          for (const t of [db.nodes, db.snapshots, db.events, db.relationships, db.stats] as const) await (t as any).where('projectId').equals(id).delete()
        })
        toast('Livro removido deste aparelho')
      }} />}
  </div>
}
