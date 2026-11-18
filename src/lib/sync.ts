import { db, now, today, uid, type BNode, type Project, type Relationship, type Snapshot, type StatDay, type TimelineEvent } from './db'

/* ---------------- Bundle (whole project as one JSON) ---------------- */

export interface Bundle {
  format: 'tinteiro'
  version: 1
  exportedAt: number
  project: Project
  nodes: BNode[]
  snapshots: Snapshot[]
  events: TimelineEvent[]
  relationships: Relationship[]
  stats: StatDay[]
}

export async function exportBundle(projectId: string): Promise<Bundle> {
  const project = await db.projects.get(projectId)
  if (!project) throw new Error('Projeto não encontrado')
  const [nodes, snapshots, events, relationships, stats] = await Promise.all([
    db.nodes.where('projectId').equals(projectId).toArray(),
    db.snapshots.where('projectId').equals(projectId).toArray(),
    db.events.where('projectId').equals(projectId).toArray(),
    db.relationships.where('projectId').equals(projectId).toArray(),
    db.stats.where('projectId').equals(projectId).toArray()
  ])
  return { format: 'tinteiro', version: 1, exportedAt: now(), project, nodes, snapshots, events, relationships, stats }
}

type WithTime = { id: string; updatedAt: number }

async function mergeTable<T extends WithTime>(table: import('dexie').Table<T, string>, remote: T[]): Promise<number> {
  if (!remote?.length) return 0
  const local = await table.bulkGet(remote.map(r => r.id))
  const toPut: T[] = []
  remote.forEach((r, i) => {
    const l = local[i]
    if (!l || (r.updatedAt ?? 0) > (l.updatedAt ?? 0)) toPut.push(r)
  })
  if (toPut.length) await table.bulkPut(toPut)
  return toPut.length
}

/** Merge a bundle into the local DB, keeping whichever copy of each item was edited last. */
export async function mergeBundle(b: Bundle, keepDriveId?: string): Promise<number> {
  if (b.format !== 'tinteiro') throw new Error('Arquivo não é um projeto do Tinteiro')
  let changed = 0
  await db.transaction('rw', [db.projects, db.nodes, db.snapshots, db.events, db.relationships, db.stats], async () => {
    const lp = await db.projects.get(b.project.id)
    if (!lp || b.project.updatedAt > lp.updatedAt) {
      await db.projects.put({ ...b.project, driveFileId: keepDriveId ?? lp?.driveFileId ?? b.project.driveFileId, lastSync: lp?.lastSync })
      changed++
    }
    changed += await mergeTable(db.nodes, b.nodes)
    changed += await mergeTable(db.snapshots, b.snapshots)
    changed += await mergeTable(db.events, b.events)
    changed += await mergeTable(db.relationships, b.relationships)
    changed += await mergeTable(db.stats, b.stats)
  })
  return changed
}

/** Import a bundle as a brand-new copy (new ids) — used when restoring a backup side by side. */
export async function importAsCopy(b: Bundle): Promise<string> {
  const map = new Map<string, string>()
  const m = (id: string) => { if (!id) return id; if (!map.has(id)) map.set(id, uid()); return map.get(id)! }
  const pid = m(b.project.id)
  const t = now()
  await db.transaction('rw', [db.projects, db.nodes, db.snapshots, db.events, db.relationships, db.stats], async () => {
    await db.projects.add({ ...b.project, id: pid, title: b.project.title + ' (restaurado)', driveFileId: undefined, lastSync: undefined, updatedAt: t })
    await db.nodes.bulkAdd(b.nodes.map(n => ({
      ...n, id: m(n.id), projectId: pid, parentId: n.parentId ? m(n.parentId) : null, pov: n.pov ? m(n.pov) : '',
      characterIds: n.characterIds.map(m), locationIds: n.locationIds.map(m), trashedFrom: n.trashedFrom ? m(n.trashedFrom) : n.trashedFrom,
      pins: n.pins.map(p => ({ ...p, nodeId: p.nodeId ? m(p.nodeId) : p.nodeId })), updatedAt: t
    })))
    await db.snapshots.bulkAdd(b.snapshots.map(s => ({ ...s, id: uid(), projectId: pid, nodeId: m(s.nodeId) })))
    await db.events.bulkAdd(b.events.map(e => ({ ...e, id: uid(), projectId: pid, nodeIds: e.nodeIds.map(m), characterIds: e.characterIds.map(m), locationIds: e.locationIds.map(m) })))
    await db.relationships.bulkAdd(b.relationships.map(r => ({ ...r, id: uid(), projectId: pid, from: m(r.from), to: m(r.to) })))
    await db.stats.bulkAdd(b.stats.map(s => ({ ...s, id: `${pid}:${s.date}`, projectId: pid })))
  })
  return pid
}

/* ---------------- Google Drive ---------------- */

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const FOLDER = 'Tinteiro'
const BACKUP_FOLDER = 'Tinteiro – Backups'
const MIME = 'application/json'
const KEEP_BACKUPS = 30

interface NativeBridge {
  platform: 'desktop'
  driveLogin(clientId: string, clientSecret: string): Promise<{ access_token: string; expires_in: number }>
  driveToken(): Promise<{ access_token: string; expires_in: number } | null>
  driveLogout(): Promise<boolean>
}

declare global {
  interface Window { google?: any; tinteiroNative?: NativeBridge }
}

/** Running inside the Windows app (Electron)? */
export const native = () => window.tinteiroNative

export async function getClientSecret(): Promise<string> {
  return ((await db.kv.get('googleClientSecret'))?.value as string) || ''
}

let token: { value: string; exp: number } | null = null
let gisLoaded: Promise<void> | null = null

export async function getClientId(): Promise<string> {
  const env = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
  if (env) return env
  const kv = await db.kv.get('googleClientId')
  return (kv?.value as string) || ''
}

function loadGis() {
  if (!gisLoaded) gisLoaded = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.onload = () => resolve()
    s.onerror = () => { gisLoaded = null; reject(new Error('Sem conexão com o Google')) }
    document.head.appendChild(s)
  })
  return gisLoaded
}

export function isConnected() { return !!token && token.exp > Date.now() + 60_000 }

function setToken(r: { access_token: string; expires_in: number }) {
  token = { value: r.access_token, exp: Date.now() + (r.expires_in - 30) * 1000 }
}

/** Make sure there is a valid token without bothering the user (Windows app refreshes silently). */
export async function ensureSession(): Promise<boolean> {
  if (isConnected()) return true
  const n = native()
  if (n) {
    const r = await n.driveToken().catch(() => null)
    if (r) { setToken(r); return true }
  }
  return false
}

export async function connectDrive(prompt: '' | 'consent' = ''): Promise<void> {
  const clientId = await getClientId()
  if (!clientId) throw new Error('Configure o "Client ID" do Google em Configurações → Google Drive.')
  const n = native()
  if (n) {
    if (await ensureSession()) return
    setToken(await n.driveLogin(clientId, await getClientSecret()))
    await db.kv.put({ key: 'driveEnabled', value: true })
    return
  }
  await loadGis()
  const hint = (await db.kv.get('googleHint'))?.value as string | undefined
  await new Promise<void>((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      hint,
      callback: (r: any) => {
        if (r.error) return reject(new Error(r.error_description || r.error))
        token = { value: r.access_token, exp: Date.now() + (r.expires_in - 30) * 1000 }
        db.kv.put({ key: 'driveEnabled', value: true })
        resolve()
      },
      error_callback: (e: any) => reject(new Error(e?.message || 'Login cancelado'))
    })
    client.requestAccessToken({ prompt })
  })
}

export async function disconnectDrive() {
  if (native()) await native()!.driveLogout()
  else if (token && window.google) window.google.accounts.oauth2.revoke(token.value, () => {})
  token = null
  await db.kv.put({ key: 'driveEnabled', value: false })
}

async function api(path: string, init: RequestInit = {}, upload = false): Promise<any> {
  if (!(await ensureSession())) throw new Error('NEEDS_LOGIN')
  const base = upload ? 'https://www.googleapis.com/upload/drive/v3' : 'https://www.googleapis.com/drive/v3'
  const r = await fetch(base + path, { ...init, headers: { Authorization: `Bearer ${token!.value}`, ...(init.headers || {}) } })
  if (r.status === 401) { token = null; throw new Error('NEEDS_LOGIN') }
  if (!r.ok) throw new Error(`Drive: ${r.status} ${await r.text()}`)
  const ct = r.headers.get('content-type') || ''
  return ct.includes('json') ? r.json() : r.text()
}

async function findOrCreateFolder(name: string, parent?: string): Promise<string> {
  const cacheKey = `folder:${name}`
  const cached = (await db.kv.get(cacheKey))?.value as string | undefined
  if (cached) return cached
  const q = encodeURIComponent(`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parent ? ` and '${parent}' in parents` : ''}`)
  const res = await api(`/files?q=${q}&fields=files(id)&spaces=drive`)
  let id: string = res.files?.[0]?.id
  if (!id) {
    const f = await api('/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: parent ? [parent] : undefined })
    })
    id = f.id
  }
  await db.kv.put({ key: cacheKey, value: id })
  return id
}

async function uploadJson(meta: Record<string, unknown>, data: unknown, fileId?: string): Promise<string> {
  const boundary = 'tinteiro' + Math.random().toString(36).slice(2)
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${MIME}\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`
  const res = await api(fileId ? `/files/${fileId}?uploadType=multipart&fields=id` : '/files?uploadType=multipart&fields=id', {
    method: fileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  }, true)
  return res.id
}

export interface RemoteProject { id: string; name: string; modifiedTime: string; projectId: string }

export async function listRemoteProjects(): Promise<RemoteProject[]> {
  const folder = await findOrCreateFolder(FOLDER)
  const q = encodeURIComponent(`'${folder}' in parents and trashed=false and appProperties has { key='tinteiro' and value='1' }`)
  const res = await api(`/files?q=${q}&fields=files(id,name,modifiedTime,appProperties)&orderBy=modifiedTime desc`)
  return (res.files || []).map((f: any) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, projectId: f.appProperties?.projectId }))
}

export async function downloadRemote(fileId: string): Promise<string> {
  const b = await api(`/files/${fileId}?alt=media`) as Bundle | string
  const bundle: Bundle = typeof b === 'string' ? JSON.parse(b) : b
  await mergeBundle(bundle, fileId)
  await db.projects.update(bundle.project.id, { driveFileId: fileId, lastSync: now() })
  return bundle.project.id
}

export type SyncResult = { pulled: number; backup: boolean }

/** Pull remote → merge → push merged copy. Also keeps one dated backup per day in Drive. */
export async function syncProject(projectId: string): Promise<SyncResult> {
  const project = await db.projects.get(projectId)
  if (!project) throw new Error('Projeto não encontrado')
  const folder = await findOrCreateFolder(FOLDER)
  let fileId = project.driveFileId
  let pulled = 0
  if (fileId) {
    try {
      const remote = await api(`/files/${fileId}?alt=media`)
      const bundle: Bundle = typeof remote === 'string' ? JSON.parse(remote) : remote
      pulled = await mergeBundle(bundle, fileId)
    } catch (e: any) {
      if (String(e.message).includes('404')) fileId = undefined
      else throw e
    }
  } else {
    const remote = (await listRemoteProjects()).find(r => r.projectId === projectId)
    if (remote) {
      fileId = remote.id
      const b = await api(`/files/${fileId}?alt=media`)
      pulled = await mergeBundle(typeof b === 'string' ? JSON.parse(b) : b, fileId)
    }
  }
  const bundle = await exportBundle(projectId)
  const name = `${bundle.project.title}.tinteiro.json`
  const meta: Record<string, unknown> = { name, appProperties: { tinteiro: '1', projectId } }
  if (!fileId) meta.parents = [folder]
  fileId = await uploadJson(meta, bundle, fileId)
  await db.projects.update(projectId, { driveFileId: fileId, lastSync: now() })

  let backup = false
  const key = `backup:${projectId}`
  if ((await db.kv.get(key))?.value !== today()) {
    const bf = await findOrCreateFolder(BACKUP_FOLDER, folder)
    await uploadJson({ name: `${bundle.project.title} — ${today()}.tinteiro.json`, parents: [bf], appProperties: { tinteiroBackup: '1', projectId } }, bundle)
    await db.kv.put({ key, value: today() })
    backup = true
    // prune old backups of this project
    const q = encodeURIComponent(`'${bf}' in parents and trashed=false and appProperties has { key='projectId' and value='${projectId}' }`)
    const list = await api(`/files?q=${q}&fields=files(id,createdTime)&orderBy=createdTime desc&pageSize=200`)
    for (const f of (list.files || []).slice(KEEP_BACKUPS)) await api(`/files/${f.id}`, { method: 'DELETE' })
  }
  return { pulled, backup }
}

export async function listBackups(projectId: string): Promise<{ id: string; name: string; createdTime: string }[]> {
  const folder = await findOrCreateFolder(FOLDER)
  const bf = await findOrCreateFolder(BACKUP_FOLDER, folder)
  const q = encodeURIComponent(`'${bf}' in parents and trashed=false and appProperties has { key='projectId' and value='${projectId}' }`)
  const res = await api(`/files?q=${q}&fields=files(id,name,createdTime)&orderBy=createdTime desc&pageSize=100`)
  return res.files || []
}

export async function fetchBundle(fileId: string): Promise<Bundle> {
  const b = await api(`/files/${fileId}?alt=media`)
  return typeof b === 'string' ? JSON.parse(b) : b
}

/** Upload any file (e.g. compiled .docx) to the Tinteiro folder. */
export async function uploadBlob(name: string, blob: Blob, mime: string): Promise<void> {
  const folder = await findOrCreateFolder(FOLDER)
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify({ name, parents: [folder] })], { type: 'application/json' }))
  form.append('file', new Blob([blob], { type: mime }))
  await api('/files?uploadType=multipart&fields=id', { method: 'POST', body: form }, true)
}
