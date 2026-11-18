import { db, type BNode, type RootRole } from './db'

export function htmlToText(html: string): string {
  if (!html) return ''
  const d = document.createElement('div')
  d.innerHTML = html.replace(/<\/(p|h[1-6]|li|blockquote)>/g, '</$1>\n')
  return (d.textContent || '').replace(/\n{3,}/g, '\n\n').trim()
}

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu)
  return m ? m.length : 0
}

export const wordsOf = (n: Pick<BNode, 'content'>) => countWords(htmlToText(n.content))

export function readingTime(words: number) {
  const min = Math.round(words / 230)
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`
}

export function sortNodes(a: BNode, b: BNode) { return a.order - b.order }

export function childrenOf(all: BNode[], parentId: string) {
  return all.filter(n => n.parentId === parentId && !n.deleted).sort(sortNodes)
}

/** Depth-first list of descendants (excluding the node itself). */
export function descendants(all: BNode[], parentId: string): BNode[] {
  const out: BNode[] = []
  const walk = (pid: string) => {
    for (const c of childrenOf(all, pid)) { out.push(c); walk(c.id) }
  }
  walk(parentId)
  return out
}

export function rootOf(all: BNode[], node: BNode | undefined): BNode | undefined {
  let cur = node
  const byId = new Map(all.map(n => [n.id, n]))
  while (cur && cur.parentId) cur = byId.get(cur.parentId)
  return cur
}

export function roleOf(all: BNode[], node: BNode | undefined): RootRole | undefined {
  return rootOf(all, node)?.role
}

export function rootByRole(all: BNode[], role: RootRole) {
  return all.find(n => n.kind === 'root' && n.role === role)
}

export async function manuscriptWords(projectId: string): Promise<number> {
  const all = await db.nodes.where('projectId').equals(projectId).toArray()
  const ms = rootByRole(all, 'manuscript')
  if (!ms) return 0
  return descendants(all, ms.id).filter(n => n.kind === 'text').reduce((s, n) => s + wordsOf(n), 0)
}

export function fmt(n: number) { return n.toLocaleString('pt-BR') }

export function fmtDate(t: number) {
  return new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function download(name: string, blob: Blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

export function safeName(s: string) { return s.replace(/[\\/:*?"<>|]+/g, '').trim() || 'livro' }

/** Resize an image file to a JPEG data URL so projects stay small enough to sync. */
export function imageToDataUrl(file: File, max = 1400, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale)
      c.height = Math.round(img.height * scale)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', quality))
    }
    img.onerror = reject
    img.src = url
  })
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise(resolve => {
    const i = document.createElement('input')
    i.type = 'file'
    i.accept = accept
    i.onchange = () => resolve(i.files?.[0] ?? null)
    i.click()
  })
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}

export function textToHtml(s: string) {
  return s.split(/\n/).map(l => `<p>${escapeHtml(l)}</p>`).join('')
}
