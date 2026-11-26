import Dexie, { type Table } from 'dexie'

export type RootRole = 'manuscript' | 'characters' | 'world' | 'timeline' | 'research' | 'notes' | 'trash'
export type NodeKind = 'root' | 'folder' | 'text' | 'character' | 'world' | 'map' | 'note' | 'research'

export interface Label { id: string; name: string; color: string }
export interface Thread { id: string; name: string; color: string }

export interface ProjectSettings {
  fontFamily: string
  fontSize: number
  lineHeight: number
  pageWidth: number
  indent: boolean
  theme: import('./themes').ThemeKey
  colors?: import('./themes').CustomColors
  sceneSeparator: string
  codex?: boolean
  /** Regras de escrita do autor, enviadas à IA em toda conversa deste livro. */
  aiRules?: string
}

export interface Project {
  id: string
  title: string
  author: string
  genre: string
  createdAt: number
  updatedAt: number
  wordGoal: number
  deadline: string
  sessionGoal: number
  labels: Label[]
  statuses: string[]
  threads?: Thread[]
  beats?: Record<string, Record<string, string>>
  settings: ProjectSettings
  driveFileId?: string
  lastSync?: number
  deleted?: boolean
}

export interface Pin { id: string; x: number; y: number; nodeId?: string; label: string }

export interface BNode {
  id: string
  projectId: string
  parentId: string | null
  order: number
  kind: NodeKind
  role?: RootRole
  title: string
  content: string
  synopsis: string
  notes: string
  labelId: string
  status: string
  keywords: string[]
  pov: string
  characterIds: string[]
  locationIds: string[]
  threadIds?: string[]
  storyDate: string
  includeInCompile: boolean
  wordTarget: number
  template: string
  fields: Record<string, string>
  customFields: { name: string; value: string }[]
  image: string
  pins: Pin[]
  aliases: string
  expanded: boolean
  trashedFrom?: string | null
  createdAt: number
  updatedAt: number
  deleted?: boolean
}

export interface Snapshot { id: string; projectId: string; nodeId: string; title: string; content: string; createdAt: number; updatedAt: number; deleted?: boolean }

export interface TimelineEvent {
  id: string
  projectId: string
  title: string
  date: string
  sortKey: number
  description: string
  color: string
  nodeIds: string[]
  characterIds: string[]
  locationIds: string[]
  updatedAt: number
  deleted?: boolean
}

export interface Relationship {
  id: string
  projectId: string
  from: string
  to: string
  type: string
  description: string
  updatedAt: number
  deleted?: boolean
}

export interface StatDay { id: string; projectId: string; date: string; startWords: number; endWords: number; updatedAt: number }

class TinteiroDB extends Dexie {
  projects!: Table<Project, string>
  nodes!: Table<BNode, string>
  snapshots!: Table<Snapshot, string>
  events!: Table<TimelineEvent, string>
  relationships!: Table<Relationship, string>
  stats!: Table<StatDay, string>
  kv!: Table<{ key: string; value: unknown }, string>

  constructor() {
    super('tinteiro')
    this.version(1).stores({
      projects: 'id, updatedAt',
      nodes: 'id, projectId, parentId, [projectId+kind], updatedAt',
      snapshots: 'id, projectId, nodeId',
      events: 'id, projectId',
      relationships: 'id, projectId',
      stats: 'id, projectId, date',
      kv: 'key'
    })
  }
}

export const db = new TinteiroDB()

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36))
export const now = () => Date.now()
export const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  fontFamily: 'Literata',
  fontSize: 19,
  lineHeight: 1.7,
  pageWidth: 720,
  indent: true,
  theme: 'sepia',
  sceneSeparator: '* * *'
}

export const DEFAULT_LABELS: Label[] = [
  { id: 'l1', name: 'Trama principal', color: '#c0392b' },
  { id: 'l2', name: 'Subtrama', color: '#2980b9' },
  { id: 'l3', name: 'Flashback', color: '#8e44ad' },
  { id: 'l4', name: 'Ação', color: '#d35400' },
  { id: 'l5', name: 'Romance', color: '#e84393' },
  { id: 'l6', name: 'Mistério', color: '#27ae60' }
]

export const DEFAULT_STATUSES = ['Ideia', 'Rascunho', '1ª revisão', '2ª revisão', 'Revisado', 'Final']

export function blankNode(p: Partial<BNode> & { projectId: string; kind: NodeKind }): BNode {
  const t = now()
  return {
    id: uid(),
    parentId: null,
    order: t,
    title: 'Sem título',
    content: '',
    synopsis: '',
    notes: '',
    labelId: '',
    status: '',
    keywords: [],
    pov: '',
    characterIds: [],
    locationIds: [],
    storyDate: '',
    includeInCompile: true,
    wordTarget: 0,
    template: '',
    fields: {},
    customFields: [],
    image: '',
    pins: [],
    aliases: '',
    expanded: true,
    createdAt: t,
    updatedAt: t,
    ...p
  }
}

export const ROOTS: { role: RootRole; title: string }[] = [
  { role: 'manuscript', title: 'Manuscrito' },
  { role: 'characters', title: 'Personagens' },
  { role: 'world', title: 'Mundo' },
  { role: 'research', title: 'Pesquisa' },
  { role: 'notes', title: 'Anotações' },
  { role: 'trash', title: 'Lixeira' }
]

export async function createProject(title: string, author: string, genre: string): Promise<string> {
  const t = now()
  const id = uid()
  const project: Project = {
    id, title, author, genre, createdAt: t, updatedAt: t,
    wordGoal: 80000, deadline: '', sessionGoal: 1000,
    labels: DEFAULT_LABELS, statuses: DEFAULT_STATUSES, settings: { ...DEFAULT_SETTINGS }
  }
  await db.transaction('rw', db.projects, db.nodes, async () => {
    await db.projects.add(project)
    let i = 0
    const roots: Record<string, string> = {}
    for (const r of ROOTS) {
      const n = blankNode({ projectId: id, kind: 'root', role: r.role, title: r.title, order: i++ })
      roots[r.role] = n.id
      await db.nodes.add(n)
    }
    const ch = blankNode({ projectId: id, kind: 'folder', parentId: roots.manuscript, title: 'Capítulo 1', order: 1 })
    await db.nodes.add(ch)
    await db.nodes.add(blankNode({ projectId: id, kind: 'text', parentId: ch.id, title: 'Cena 1', order: 1, status: 'Ideia' }))
  })
  return id
}

export async function touchProject(projectId: string) {
  await db.projects.update(projectId, { updatedAt: now() })
}

export async function updateNode(id: string, patch: Partial<BNode>) {
  const n = await db.nodes.get(id)
  if (!n) return
  await db.nodes.update(id, { ...patch, updatedAt: now() })
  await touchProject(n.projectId)
}
