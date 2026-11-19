import { useMemo, useState } from 'react'
import { db, now, uid } from '../lib/db'
import { useWS } from '../lib/ctx'
import { htmlToText, roleOf, rootByRole, descendants } from '../lib/util'
import { nodeIcon } from './Binder'
import { Confirm, Modal, toast } from './ui'

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Replace text only inside text nodes of the HTML, preserving formatting. */
function replaceInHtml(html: string, re: RegExp, rep: string): { html: string; n: number } {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  let n = 0
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  let t: Node | null
  while ((t = walker.nextNode())) {
    const s = t.textContent || ''
    const r = s.replace(re, () => { n++; return rep })
    if (r !== s) t.textContent = r
  }
  return { html: doc.body.firstElementChild!.innerHTML, n }
}

export default function Search({ onClose, initial = '' }: { onClose: () => void; initial?: string }) {
  const { nodes, select } = useWS()
  const [q, setQ] = useState(initial)
  const [whole0] = useState(!!initial)
  const [rep, setRep] = useState('')
  const [whole, setWhole] = useState(whole0)
  const [matchCase, setMatchCase] = useState(false)
  const [scope, setScope] = useState<'all' | 'manuscript'>('all')
  const [confirm, setConfirm] = useState(false)

  const re = useMemo(() => {
    if (q.trim().length < 2) return null
    const body = esc(q)
    return new RegExp(whole ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body, 'gu' + (matchCase ? '' : 'i'))
  }, [q, whole, matchCase])

  const results = useMemo(() => {
    if (!re) return []
    const ms = rootByRole(nodes, 'manuscript')
    const pool = scope === 'manuscript' && ms ? descendants(nodes, ms.id) : nodes.filter(n => !n.deleted && n.kind !== 'root' && roleOf(nodes, n) !== 'trash')
    const out: { id: string; title: string; icon: string; where: string; snippet: string; count: number }[] = []
    for (const n of pool) {
      const parts: [string, string][] = [['título', n.title], ['texto', htmlToText(n.content)], ['sinopse', n.synopsis], ['anotações', n.notes], ['ficha', Object.values(n.fields).join(' • ')], ['campos', n.customFields.map(c => c.value).join(' ')]]
      let count = 0, snippet = '', where = ''
      for (const [w, text] of parts) {
        if (!text) continue
        const m = [...text.matchAll(re)]
        if (m.length) {
          count += m.length
          if (!snippet) {
            const i = m[0].index!
            snippet = (i > 40 ? '…' : '') + text.slice(Math.max(0, i - 40), i + q.length + 60) + '…'
            where = w
          }
        }
      }
      if (count) out.push({ id: n.id, title: n.title, icon: nodeIcon(n, roleOf(nodes, n)), where, snippet, count })
    }
    return out.sort((a, b) => b.count - a.count)
  }, [re, nodes, scope, q])

  const total = results.reduce((s, r) => s + r.count, 0)

  const replaceAll = async () => {
    if (!re) return
    let n = 0
    const ids = new Set(results.map(r => r.id))
    for (const node of nodes.filter(x => ids.has(x.id))) {
      const patch: Record<string, unknown> = {}
      if (node.content) {
        const r = replaceInHtml(node.content, re, rep)
        if (r.n) {
          await db.snapshots.add({ id: uid(), projectId: node.projectId, nodeId: node.id, title: `Antes de substituir “${q}”`, content: node.content, createdAt: now(), updatedAt: now() })
          patch.content = r.html; n += r.n
        }
      }
      const t = node.title.replace(re, () => { n++; return rep }); if (t !== node.title) patch.title = t
      const s = node.synopsis.replace(re, () => { n++; return rep }); if (s !== node.synopsis) patch.synopsis = s
      const no = node.notes.replace(re, () => { n++; return rep }); if (no !== node.notes) patch.notes = no
      if (Object.keys(patch).length) await db.nodes.update(node.id, { ...patch, updatedAt: now() })
    }
    toast(`${n} substituição(ões). Um snapshot de cada cena alterada foi salvo.`)
    setConfirm(false)
  }

  return <Modal wide title="Buscar no projeto" onClose={onClose}>
    <div className="row wrap">
      <input autoFocus className="grow" placeholder="Buscar em cenas, fichas, anotações…" value={q} onChange={e => setQ(e.target.value)} />
      <select value={scope} onChange={e => setScope(e.target.value as 'all' | 'manuscript')}><option value="all">Tudo</option><option value="manuscript">Só manuscrito</option></select>
      <label className="inline"><input type="checkbox" checked={whole} onChange={e => setWhole(e.target.checked)} /> palavra inteira</label>
      <label className="inline"><input type="checkbox" checked={matchCase} onChange={e => setMatchCase(e.target.checked)} /> Aa</label>
    </div>
    <div className="row wrap">
      <input className="grow" placeholder="Substituir por… (ex.: renomear um personagem)" value={rep} onChange={e => setRep(e.target.value)} />
      <button disabled={!results.length} onClick={() => setConfirm(true)}>Substituir tudo</button>
    </div>
    <p className="muted">{re ? `${total} ocorrência(s) em ${results.length} item(ns)` : 'Digite pelo menos 2 letras'}</p>
    <ul className="results">
      {results.map(r => <li key={r.id} onClick={() => { select(r.id); onClose() }}>
        <div><span>{r.icon}</span> <strong>{r.title}</strong> <span className="muted">· {r.where} · ×{r.count}</span></div>
        <p>{r.snippet}</p>
      </li>)}
    </ul>
    {confirm && <Confirm text={`Substituir ${total} ocorrência(s) de “${q}” por “${rep}”? Um snapshot de cada cena alterada será salvo antes.`} yes="Substituir" onNo={() => setConfirm(false)} onYes={replaceAll} />}
  </Modal>
}
