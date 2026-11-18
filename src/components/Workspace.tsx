import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { blankNode, db, now, today, touchProject, type BNode } from '../lib/db'
import { WSContext, type FolderView, type Tool, type WS } from '../lib/ctx'
import { manuscriptWords, roleOf, rootByRole } from '../lib/util'
import { connectDrive, ensureSession, syncProject } from '../lib/sync'
import Binder from './Binder'
import MainView from './MainView'
import Inspector from './Inspector'
import Tools from './Tools'
import { toast } from './ui'

type SyncState = 'off' | 'idle' | 'syncing' | 'error' | 'login'

export default function Workspace({ projectId, onExit }: { projectId: string; onExit: () => void }) {
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId])
  const nodes = useLiveQuery(() => db.nodes.where('projectId').equals(projectId).toArray(), [projectId])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [folderView, setFolderView] = useState<FolderView>('corkboard')
  const [tool, setTool] = useState<Tool>(null)
  const [composition, setComposition] = useState(false)
  const [binderOpen, setBinderOpen] = useState(window.innerWidth > 900)
  const [inspectorOpen, setInspectorOpen] = useState(window.innerWidth > 1200)
  const [sync, setSync] = useState<SyncState>('off')
  const dirty = useRef(false)

  const byId = useMemo(() => new Map((nodes || []).map(n => [n.id, n])), [nodes])

  useEffect(() => {
    db.kv.get('sel:' + projectId).then(kv => setSelectedId((kv?.value as string) || null))
    db.kv.get('folderView').then(kv => kv?.value && setFolderView(kv.value as FolderView))
  }, [projectId])

  const select = useCallback((id: string | null) => {
    setSelectedId(id)
    setTool(null)
    db.kv.put({ key: 'sel:' + projectId, value: id })
    if (window.innerWidth <= 900) setBinderOpen(false)
  }, [projectId])

  // default selection: first scene of manuscript
  useEffect(() => {
    if (!nodes || selectedId) return
    const ms = rootByRole(nodes, 'manuscript')
    if (ms) setSelectedId(ms.id)
  }, [nodes, selectedId])

  /* ---- writing statistics: words written today ---- */
  const recordWords = useCallback(async () => {
    const total = await manuscriptWords(projectId)
    const id = `${projectId}:${today()}`
    const s = await db.stats.get(id)
    if (s) await db.stats.update(id, { endWords: total, updatedAt: now() })
    else {
      // baseline = last known total from a previous day (so words typed before the first save count)
      const prev = (await db.stats.where('projectId').equals(projectId).sortBy('date')).pop()
      await db.stats.put({ id, projectId, date: today(), startWords: prev ? prev.endWords : total, endWords: total, updatedAt: now() })
    }
    dirty.current = true
  }, [projectId])

  useEffect(() => { recordWords() }, [recordWords])

  /* ---- Google Drive sync ---- */
  const doSync = useCallback(async (interactive: boolean) => {
    const enabled = (await db.kv.get('driveEnabled'))?.value
    if (!enabled && !interactive) { setSync('off'); return }
    try {
      if (!(await ensureSession())) {
        if (!interactive) { setSync('login'); return }
        await connectDrive()
      }
      setSync('syncing')
      dirty.current = false
      const r = await syncProject(projectId)
      setSync('idle')
      if (interactive) toast(`Sincronizado${r.pulled ? ` · ${r.pulled} alteração(ões) recebida(s)` : ''}${r.backup ? ' · backup do dia criado' : ''}`)
    } catch (e: any) {
      if (e.message === 'NEEDS_LOGIN') setSync('login')
      else { setSync('error'); if (interactive) toast(e.message, 'err') }
    }
  }, [projectId])

  useEffect(() => {
    db.kv.get('driveEnabled').then(async kv => {
      if (!kv?.value) { setSync('off'); return }
      if (await ensureSession()) doSync(false); else setSync('login')
    })
    const iv = setInterval(() => { if (dirty.current) doSync(false) }, 90_000)
    const vis = () => { if (document.visibilityState === 'hidden' && dirty.current) doSync(false) }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', vis) }
  }, [doSync])

  useEffect(() => { if (nodes) dirty.current = true }, [nodes])

  const addNode = useCallback(async (parentId: string, kind: BNode['kind'], extra: Partial<BNode> = {}) => {
    const all = await db.nodes.where('projectId').equals(projectId).toArray()
    const siblings = all.filter(n => n.parentId === parentId)
    const order = siblings.length ? Math.max(...siblings.map(s => s.order)) + 1 : 0
    const titles: Record<string, string> = { folder: 'Nova pasta', text: 'Nova cena', character: 'Novo personagem', world: 'Nova entrada', map: 'Novo mapa', note: 'Nova anotação', research: 'Nova pesquisa' }
    const parent = all.find(n => n.id === parentId)
    const role = roleOf(all, parent)
    let title = titles[kind] || 'Sem título'
    if (kind === 'folder' && role === 'manuscript') title = `Capítulo ${all.filter(n => n.kind === 'folder' && roleOf(all, n) === 'manuscript').length + 1}`
    const n = blankNode({ projectId, parentId, kind, title, order, status: kind === 'text' && role === 'manuscript' ? 'Ideia' : '', ...extra })
    await db.nodes.add(n)
    if (parent && !parent.expanded) await db.nodes.update(parent.id, { expanded: true })
    await touchProject(projectId)
    select(n.id)
    return n.id
  }, [projectId, select])

  const trashNode = useCallback(async (id: string) => {
    const all = await db.nodes.where('projectId').equals(projectId).toArray()
    const trash = rootByRole(all, 'trash')
    const n = all.find(x => x.id === id)
    if (!n || !trash || n.kind === 'root') return
    await db.nodes.update(id, { parentId: trash.id, trashedFrom: n.parentId, order: now(), updatedAt: now() })
    await touchProject(projectId)
    if (selectedId === id) select(n.parentId)
    toast('Movido para a Lixeira')
  }, [projectId, selectedId, select])

  if (!project || !nodes) return <div className="loading">Abrindo…</div>

  const ws: WS = { project, nodes, byId, selectedId, select, folderView, setFolderView: v => { setFolderView(v); db.kv.put({ key: 'folderView', value: v }) }, tool, setTool, composition, setComposition, addNode, trashNode, recordWords }

  const syncLabel: Record<SyncState, string> = { off: '☁ Conectar Drive', idle: '☁ Sincronizado', syncing: '⟳ Sincronizando…', error: '⚠ Erro ao sincronizar', login: '☁ Entrar no Google' }

  return <WSContext.Provider value={ws}>
    <div className={`app theme-${project.settings.theme}${composition ? ' composing' : ''}`}>
      {!composition && <header className="topbar">
        <button className="icon" title="Livros" onClick={onExit}>⌂</button>
        <button className={'icon' + (binderOpen ? ' on' : '')} title="Estrutura (binder)" onClick={() => setBinderOpen(o => !o)}>☰</button>
        <h1 className="ptitle" title={project.title}>{project.title}</h1>
        <nav className="tools">
          <button onClick={() => setTool('search')} title="Buscar e substituir (Ctrl+Shift+F)">🔍<span>Buscar</span></button>
          <button onClick={() => setTool('timeline')} className={tool === 'timeline' ? 'on' : ''}>🕰<span>Linha do tempo</span></button>
          <button onClick={() => setTool('relations')} className={tool === 'relations' ? 'on' : ''}>🕸<span>Relações</span></button>
          <button onClick={() => setTool('stats')} className={tool === 'stats' ? 'on' : ''}>🎯<span>Metas</span></button>
          <button onClick={() => setTool('names')}>🎲<span>Nomes</span></button>
          <button onClick={() => setTool('compile')}>📕<span>Exportar</span></button>
          <button onClick={() => setTool('settings')}>⚙<span>Ajustes</span></button>
          <button className={'sync ' + sync} onClick={() => doSync(true)} disabled={sync === 'syncing'} title={project.lastSync ? 'Última sincronização: ' + new Date(project.lastSync).toLocaleString('pt-BR') : ''}>{syncLabel[sync]}</button>
        </nav>
        <button className={'icon' + (inspectorOpen ? ' on' : '')} title="Inspetor" onClick={() => setInspectorOpen(o => !o)}>ⓘ</button>
      </header>}
      <div className="body">
        {!composition && binderOpen && <aside className="binder-pane"><Binder /></aside>}
        {!composition && binderOpen && window.innerWidth <= 900 && <div className="scrim" onClick={() => setBinderOpen(false)} />}
        <main className="main-pane">
          {tool && ['timeline', 'relations', 'stats'].includes(tool) ? <Tools /> : <MainView />}
        </main>
        {!composition && inspectorOpen && <aside className="inspector-pane"><Inspector onClose={() => setInspectorOpen(false)} /></aside>}
      </div>
      {tool && !['timeline', 'relations', 'stats'].includes(tool) && <Tools />}
    </div>
  </WSContext.Provider>
}
