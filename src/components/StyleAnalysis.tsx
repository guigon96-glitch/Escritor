import { useMemo, useState } from 'react'
import type { BNode } from '../lib/db'
import { useWS } from '../lib/ctx'
import { childrenOf, descendants, fmt, htmlToText, rootByRole } from '../lib/util'

const STOP = new Set(('a o os as e é de do da dos das em no na nos nas um uma uns umas que se por para com como mais mas não sem seu sua seus suas ele ela eles elas lhe lhes já ao aos à às era foi ser ter tinha havia isso isto esse essa este esta aquele aquela me te nos vos meu minha teu tua ou quando onde quem qual porque pois só até sobre entre também muito pouco então ainda depois antes enquanto cada todo toda todos todas outro outra outros outras mesmo mesma há está estava estavam são eram seja fosse num numa pelo pela pelos pelas lo la los las você vocês eu tu nós dele dela deles delas disso nisso daquele daquela algo nada tudo assim aqui ali lá agora apenas sua sob após contra desde perante ao').split(' '))
const words = (t: string) => t.toLowerCase().match(/[\p{L}][\p{L}'’-]*/gu) || []

interface Unit { node: BNode; chapter?: BNode; text: string }

function analyse(units: Unit[], names: Set<string> = new Set()) {
  const freq = new Map<string, number>(), bi = new Map<string, number>(), tri = new Map<string, number>()
  let total = 0, sentences = 0, sentWords = 0, dialogueWords = 0, mente = 0
  const long: { u: Unit; s: string; n: number }[] = []
  const near: { u: Unit; w: string; ctx: string }[] = []
  for (const u of units) {
    const paras = u.text.split(/\n+/)
    for (const p of paras) {
      const pw = words(p)
      if (/^\s*[—–-]/.test(p)) dialogueWords += pw.length
    }
    const ws = words(u.text)
    total += ws.length
    ws.forEach((w, i) => {
      if (w.endsWith('mente') && w.length > 6) mente++
      if (!STOP.has(w) && w.length > 2 && !names.has(w)) freq.set(w, (freq.get(w) || 0) + 1)
      if (i > 0) { const b = ws[i - 1] + ' ' + w; bi.set(b, (bi.get(b) || 0) + 1) }
      if (i > 1) { const t = ws[i - 2] + ' ' + ws[i - 1] + ' ' + w; tri.set(t, (tri.get(t) || 0) + 1) }
      // repetição próxima: mesma palavra "forte" nas 25 anteriores
      if (w.length >= 5 && !STOP.has(w) && near.length < 400) {
        const back = ws.slice(Math.max(0, i - 25), i)
        if (back.includes(w)) near.push({ u, w, ctx: ws.slice(Math.max(0, i - 8), i + 3).join(' ') })
      }
    })
    for (const s of u.text.split(/(?<=[.!?…])\s+/)) {
      const n = words(s).length
      if (!n) continue
      sentences++; sentWords += n
      if (n > 40) long.push({ u, s: s.trim(), n })
    }
  }
  const top = (m: Map<string, number>, k: number, filter?: (s: string) => boolean) => [...m.entries()].filter(([s, c]) => c > 2 && (!filter || filter(s))).sort((a, b) => b[1] - a[1]).slice(0, k)
  const content = (s: string) => s.split(' ').filter(w => !STOP.has(w) && !names.has(w)).length
  const interesting = (s: string) => /^como (um|uma|se)\b/.test(s) || (s.split(' ').length === 2 ? content(s) === 2 : content(s) >= 2)
  const nearCount = new Map<string, number>()
  near.forEach(x => nearCount.set(x.w, (nearCount.get(x.w) || 0) + 1))
  return {
    total, sentences, avg: sentences ? sentWords / sentences : 0, dialogue: total ? dialogueWords / total : 0, mente,
    unique: total ? freq.size / total : 0,
    topWords: top(freq, 30), topBi: top(bi, 20, interesting), topTri: top(tri, 15, interesting),
    long: long.sort((a, b) => b.n - a.n).slice(0, 25), near: [...nearCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20), nearEx: near
  }
}

export default function StyleAnalysis() {
  const { nodes, select, openSearch } = useWS()
  const names = useMemo(() => new Set(nodes.filter(n => !n.deleted && (n.kind === 'character' || n.kind === 'world')).flatMap(n => [n.title, n.aliases, n.fields?.fullName || ''].join(' ').toLowerCase().match(/[\p{L}][\p{L}'’-]*/gu) || []).filter(w => w.length > 3 && !STOP.has(w))), [nodes])
  const ms = rootByRole(nodes, 'manuscript')!
  const chapters = childrenOf(nodes, ms.id).filter(c => descendants(nodes, c.id).some(d => d.kind === 'text') || c.kind === 'text')
  const [scope, setScope] = useState<string>('all')
  const units: Unit[] = useMemo(() => {
    const out: Unit[] = []
    for (const ch of chapters) {
      if (scope !== 'all' && scope !== ch.id) continue
      const sc = ch.kind === 'text' ? [ch] : descendants(nodes, ch.id).filter(n => n.kind === 'text')
      sc.forEach(n => out.push({ node: n, chapter: ch, text: htmlToText(n.content) }))
    }
    return out
  }, [nodes, scope, chapters])
  const a = useMemo(() => analyse(units, names), [units, names])
  const perChapter = useMemo(() => chapters.map(ch => {
    const sc = ch.kind === 'text' ? [ch] : descendants(nodes, ch.id).filter(n => n.kind === 'text')
    const r = analyse(sc.map(n => ({ node: n, chapter: ch, text: htmlToText(n.content) })))
    const pov = sc[0]?.pov ? nodes.find(n => n.id === sc[0].pov)?.title : ''
    return { ch, r, pov, scenes: sc.length }
  }), [nodes, chapters])
  const pct = (x: number) => (x * 100).toFixed(0) + '%'

  return <div className="style-view">
    <div className="fv-head">
      <div><h2>🔬 Análise de estilo</h2><span className="muted">Repetições, ritmo das frases e equilíbrio entre diálogo e narração. Toque numa palavra para encontrá-la no texto.</span></div>
      <select value={scope} onChange={e => setScope(e.target.value)}>
        <option value="all">Manuscrito inteiro</option>
        {chapters.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
    </div>
    <div className="stat-cards">
      <div className="stat-card"><h4>Palavras</h4><div className="big-num">{fmt(a.total)}</div><small className="muted">{fmt(a.sentences)} frases</small></div>
      <div className="stat-card"><h4>Média por frase</h4><div className="big-num">{a.avg.toFixed(1)}</div><small className="muted">ficção costuma ficar entre 12 e 20</small></div>
      <div className="stat-card"><h4>Diálogo</h4><div className="big-num">{pct(a.dialogue)}</div><small className="muted">do texto está em falas</small></div>
      <div className="stat-card"><h4>Advérbios em “-mente”</h4><div className="big-num">{fmt(a.mente)}</div><small className="muted">{a.total ? (a.mente / a.total * 1000).toFixed(1) : 0} por mil palavras</small></div>
    </div>
    <div className="stat-cols">
      <div>
        <h3 className="group-title">Palavras mais usadas <small className="muted">(sem nomes de personagens e lugares)</small></h3>
        <div className="chips word-chips">{a.topWords.map(([w, c]) => <button key={w} onClick={() => openSearch(w)}>{w} <small>{c}</small></button>)}</div>
        <h3 className="group-title">Expressões repetidas</h3>
        <div className="chips word-chips">{[...a.topBi, ...a.topTri].sort((x, y) => y[1] - x[1]).slice(0, 25).map(([w, c]) => <button key={w} onClick={() => openSearch(w)}>“{w}” <small>{c}</small></button>)}</div>
        <h3 className="group-title">Repetição próxima (mesma palavra a menos de 25 palavras)</h3>
        <div className="chips word-chips">{a.near.map(([w, c]) => <button key={w} onClick={() => openSearch(w)}>{w} <small>{c}×</small></button>)}</div>
      </div>
      <div>
        <h3 className="group-title">Frases muito longas (mais de 40 palavras)</h3>
        {a.long.length === 0 && <p className="muted">Nenhuma. 👏</p>}
        <ul className="results">{a.long.map((l, i) => <li key={i} onClick={() => select(l.u.node.id)}>
          <div><strong>{l.u.node.title}</strong> <span className="muted">· {l.n} palavras</span></div>
          <p>{l.s.length > 240 ? l.s.slice(0, 240) + '…' : l.s}</p>
        </li>)}</ul>
      </div>
    </div>
    {scope === 'all' && <>
      <h3 className="group-title">Por capítulo</h3>
      <div className="outliner-wrap"><table className="outliner">
        <thead><tr><th>Capítulo</th><th>POV</th><th className="num">Cenas</th><th className="num">Palavras</th><th className="num">Média/frase</th><th className="num">Diálogo</th><th className="num">-mente/mil</th></tr></thead>
        <tbody>{perChapter.map(({ ch, r, pov, scenes }) => <tr key={ch.id}>
          <td><button className="linkish" onClick={() => setScope(ch.id)}>{ch.title}</button></td>
          <td>{pov}</td><td className="num">{scenes}</td><td className="num">{fmt(r.total)}</td>
          <td className="num">{r.avg.toFixed(1)}</td><td className="num">{pct(r.dialogue)}</td>
          <td className="num">{r.total ? (r.mente / r.total * 1000).toFixed(1) : '0'}</td>
        </tr>)}</tbody>
      </table></div>
    </>}
  </div>
}
