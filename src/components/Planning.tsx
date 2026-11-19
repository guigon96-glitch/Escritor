import { useMemo, useState } from 'react'
import { db, now, uid, updateNode, type BNode, type Thread } from '../lib/db'
import { useWS } from '../lib/ctx'
import { childrenOf, descendants, fmt, rootByRole, wordsOf } from '../lib/util'
import { Menu } from './ui'

const PALETTE = ['#c0392b', '#2471a3', '#17a589', '#b9770e', '#7d3c98', '#d35490', '#5d6d7e', '#27ae60', '#e67e22', '#1abc9c']

/* =================== Grade de enredo (linhas narrativas × capítulos) =================== */
export function PlotGrid() {
  const { project, nodes, select } = useWS()
  const threads = project.threads || []
  const ms = rootByRole(nodes, 'manuscript')!
  const chapters = childrenOf(nodes, ms.id)
  const scenesOf = (ch: BNode) => ch.kind === 'text' ? [ch] : descendants(nodes, ch.id).filter(n => n.kind === 'text')
  const [menu, setMenu] = useState<{ x: number; y: number; ch: BNode; th: Thread } | null>(null)

  const saveThreads = (t: Thread[]) => db.projects.update(project.id, { threads: t, updatedAt: now() })
  const addThread = () => {
    const name = prompt('Nome da linha narrativa (ex.: Trama principal, Romance, Mistério do Cubo)')
    if (name?.trim()) saveThreads([...threads, { id: uid(), name: name.trim(), color: PALETTE[threads.length % PALETTE.length] }])
  }
  const toggle = (scene: BNode, th: string) => {
    const cur = scene.threadIds || []
    updateNode(scene.id, { threadIds: cur.includes(th) ? cur.filter(x => x !== th) : [...cur, th] })
  }
  const rows: (Thread & { none?: boolean })[] = [...threads, { id: '', name: 'Sem linha narrativa', color: '#999', none: true }]

  return <div className="plotgrid-view">
    <div className="fv-head">
      <div><h2>🧵 Grade de enredo</h2><span className="muted">Linhas narrativas (subtramas) × capítulos. Veja onde cada fio aparece e onde some por tempo demais.</span></div>
      <button className="primary" onClick={addThread}>＋ Linha narrativa</button>
    </div>
    {threads.length === 0 && <div className="empty">Crie suas linhas narrativas (trama principal, subtramas, arcos de personagem, mistérios). Depois toque em ＋ nas células para ligar cenas a elas — ou use o campo “Linhas narrativas” no Inspetor.</div>}
    <div className="pg-wrap">
      <div className="pg" style={{ gridTemplateColumns: `minmax(190px, 230px) repeat(${chapters.length}, minmax(150px, 1fr))` }}>
        <div className="pg-corner" />
        {chapters.map(ch => {
          const wc = scenesOf(ch).reduce((s, n) => s + wordsOf(n), 0)
          return <div key={ch.id} className="pg-head" onClick={() => select(ch.id)} title={ch.synopsis}>
            <strong>{ch.title.replace(/^Capítulo\s+/i, 'Cap. ')}</strong><small className="muted">{fmt(wc)} pal.</small>
          </div>
        })}
        {rows.map(th => <div key={th.id || 'none'} style={{ display: 'contents' }}>
          <div className="pg-lane" style={{ borderLeftColor: th.color }}>
            {th.none ? <span className="muted">{th.name}</span> : <>
              <input type="color" value={th.color} onChange={e => saveThreads(threads.map(t => t.id === th.id ? { ...t, color: e.target.value } : t))} />
              <input className="pg-name" defaultValue={th.name} onBlur={e => e.target.value.trim() && saveThreads(threads.map(t => t.id === th.id ? { ...t, name: e.target.value.trim() } : t))} />
              <button className="icon" title="Excluir linha" onClick={() => confirm(`Excluir a linha “${th.name}”? As cenas continuam, só perdem a ligação.`) && saveThreads(threads.filter(t => t.id !== th.id))}>🗑</button>
            </>}
          </div>
          {chapters.map(ch => {
            const sc = scenesOf(ch).filter(n => th.none ? !(n.threadIds || []).some(id => threads.some(t => t.id === id)) : (n.threadIds || []).includes(th.id))
            return <div key={ch.id} className="pg-cell">
              {sc.map(n => <div key={n.id} className="pg-card" style={{ borderLeftColor: th.color }} title={n.synopsis} onClick={() => select(n.id)}>
                <span>{n.title}</span>
                {!th.none && <button className="pg-x" title="Tirar desta linha" onClick={e => { e.stopPropagation(); toggle(n, th.id) }}>×</button>}
              </div>)}
              {!th.none && <button className="pg-add" title="Ligar cena deste capítulo" onClick={e => setMenu({ x: e.clientX, y: e.clientY, ch, th })}>＋</button>}
            </div>
          })}
        </div>)}
      </div>
    </div>
    {menu && <Menu x={menu.x} y={menu.y} onClose={() => setMenu(null)} items={(() => {
      const opts = scenesOf(menu.ch).filter(n => !(n.threadIds || []).includes(menu.th.id))
      return opts.length ? opts.map(n => ({ label: n.title, onClick: () => toggle(n, menu.th.id) })) : [{ label: 'Todas as cenas já estão nesta linha', onClick: () => {} }]
    })()} />}
  </div>
}

/* =================== Estruturas narrativas (beat sheets) =================== */
interface Beat { k: string; name: string; pct: number; desc: string }
export const STRUCTURES: { key: string; name: string; beats: Beat[] }[] = [
  { key: 'tres-atos', name: 'Três atos', beats: [
    { k: 'gancho', name: 'Gancho de abertura', pct: 1, desc: 'Uma imagem/cena que prende e apresenta o tom.' },
    { k: 'incidente', name: 'Incidente incitante', pct: 12, desc: 'Algo tira o protagonista da normalidade.' },
    { k: 'pv1', name: '1º ponto de virada', pct: 25, desc: 'O protagonista se compromete; começa o Ato 2.' },
    { k: 'medio', name: 'Ponto médio', pct: 50, desc: 'Revelação ou virada que muda o jogo.' },
    { k: 'pv2', name: '2º ponto de virada / crise', pct: 75, desc: 'Tudo desaba; começa o Ato 3.' },
    { k: 'climax', name: 'Clímax', pct: 90, desc: 'O confronto decisivo.' },
    { k: 'resolucao', name: 'Resolução', pct: 98, desc: 'O novo normal.' }
  ] },
  { key: 'save-the-cat', name: 'Save the Cat (15 batidas)', beats: [
    { k: 'abertura', name: 'Imagem de abertura', pct: 0, desc: 'Retrato do mundo/herói "antes".' },
    { k: 'tema', name: 'Tema apresentado', pct: 5, desc: 'Alguém diz (sem saber) a lição que o herói precisa aprender.' },
    { k: 'preparacao', name: 'Preparação', pct: 5, desc: 'Vida, falhas e o que está em jogo.' },
    { k: 'catalisador', name: 'Catalisador', pct: 10, desc: 'O evento que muda tudo.' },
    { k: 'debate', name: 'Debate', pct: 15, desc: 'Hesitação: devo ir?' },
    { k: 'ato2', name: 'Entrada no Ato 2', pct: 20, desc: 'Escolha ativa de entrar no mundo novo.' },
    { k: 'historiab', name: 'História B', pct: 22, desc: 'Relação que carrega o tema (amor, mentor…).' },
    { k: 'diversao', name: 'Diversão e jogos', pct: 30, desc: 'A "promessa da premissa" sendo cumprida.' },
    { k: 'medio', name: 'Ponto médio', pct: 50, desc: 'Falsa vitória ou falsa derrota; aumenta a aposta.' },
    { k: 'viloes', name: 'Os vilões se aproximam', pct: 55, desc: 'Pressão externa e interna cresce.' },
    { k: 'perdido', name: 'Tudo está perdido', pct: 75, desc: 'O pior momento; algo/alguém morre (de verdade ou simbolicamente).' },
    { k: 'noite', name: 'Noite escura da alma', pct: 78, desc: 'O herói encara a própria mentira.' },
    { k: 'ato3', name: 'Entrada no Ato 3', pct: 80, desc: 'A solução nasce da junção das tramas A e B.' },
    { k: 'final', name: 'Final', pct: 85, desc: 'Execução do plano e transformação.' },
    { k: 'imagemfinal', name: 'Imagem final', pct: 99, desc: 'Espelho da abertura, mostrando a mudança.' }
  ] },
  { key: 'jornada', name: 'Jornada do Herói (12 etapas)', beats: [
    { k: 'mundo', name: 'Mundo comum', pct: 0, desc: '' }, { k: 'chamado', name: 'Chamado à aventura', pct: 10, desc: '' },
    { k: 'recusa', name: 'Recusa do chamado', pct: 15, desc: '' }, { k: 'mentor', name: 'Encontro com o mentor', pct: 20, desc: '' },
    { k: 'limiar', name: 'Travessia do limiar', pct: 25, desc: '' }, { k: 'testes', name: 'Testes, aliados e inimigos', pct: 35, desc: '' },
    { k: 'caverna', name: 'Aproximação da caverna oculta', pct: 45, desc: '' }, { k: 'provacao', name: 'Provação', pct: 50, desc: '' },
    { k: 'recompensa', name: 'Recompensa', pct: 60, desc: '' }, { k: 'volta', name: 'Caminho de volta', pct: 75, desc: '' },
    { k: 'ressurreicao', name: 'Ressurreição', pct: 90, desc: '' }, { k: 'elixir', name: 'Retorno com o elixir', pct: 98, desc: '' }
  ] },
  { key: 'sete-pontos', name: 'Estrutura de sete pontos', beats: [
    { k: 'gancho', name: 'Gancho', pct: 0, desc: 'O oposto da resolução.' }, { k: 'tp1', name: '1º ponto de trama', pct: 15, desc: 'O conflito entra.' },
    { k: 'pinch1', name: '1º ponto de pressão', pct: 30, desc: 'O antagonista mostra força.' }, { k: 'medio', name: 'Ponto médio', pct: 50, desc: 'De reação para ação.' },
    { k: 'pinch2', name: '2º ponto de pressão', pct: 65, desc: 'Perda; o plano falha.' }, { k: 'tp2', name: '2º ponto de trama', pct: 80, desc: 'A última peça aparece.' },
    { k: 'resolucao', name: 'Resolução', pct: 98, desc: 'O clímax resolve o conflito.' }
  ] }
]

export function StructureView() {
  const { project, nodes, select } = useWS()
  const [tpl, setTpl] = useState(STRUCTURES[0].key)
  const [base, setBase] = useState<'atual' | 'meta'>('meta')
  const ms = rootByRole(nodes, 'manuscript')!
  const scenes = useMemo(() => {
    let acc = 0
    return descendants(nodes, ms.id).filter(n => n.kind === 'text' && n.includeInCompile).map(n => {
      const w = wordsOf(n); const start = acc; acc += w
      const ch = n.parentId ? nodes.find(x => x.id === n.parentId) : undefined
      return { n, start, end: acc, w, ch }
    })
  }, [nodes, ms.id])
  const total = scenes.at(-1)?.end || 0
  const ref = base === 'meta' ? Math.max(project.wordGoal, total) : total
  const s = STRUCTURES.find(x => x.key === tpl)!
  const assigned = project.beats?.[tpl] || {}
  const setBeat = (k: string, id: string) => db.projects.update(project.id, { beats: { ...(project.beats || {}), [tpl]: { ...assigned, [k]: id } }, updatedAt: now() })
  const sceneAt = (word: number) => scenes.find(x => word >= x.start && word < x.end)
  const posOf = (id: string) => { const sc = scenes.find(x => x.n.id === id); return sc ? (sc.start + sc.w / 2) / ref * 100 : null }

  return <div className="structure-view">
    <div className="fv-head">
      <div><h2>🏛 Estrutura narrativa</h2><span className="muted">Compare onde cada batida deveria cair com onde ela está no seu manuscrito.</span></div>
      <div className="row wrap">
        <select value={tpl} onChange={e => setTpl(e.target.value)}>{STRUCTURES.map(x => <option key={x.key} value={x.key}>{x.name}</option>)}</select>
        <select value={base} onChange={e => setBase(e.target.value as 'atual' | 'meta')}>
          <option value="meta">Base: livro completo (meta {fmt(Math.max(project.wordGoal, total))} pal.)</option>
          <option value="atual">Base: só o que já está escrito ({fmt(total)} pal.)</option>
        </select>
      </div>
    </div>
    <div className="st-track">
      <div className="st-written" style={{ width: Math.min(100, total / ref * 100) + '%' }} title={`Escrito: ${fmt(total)} palavras`} />
      {s.beats.map(b => <div key={b.k} className="st-mark" style={{ left: b.pct + '%' }} title={`${b.name} — ${b.pct}%`} />)}
      {s.beats.map(b => { const p = assigned[b.k] ? posOf(assigned[b.k]) : null; return p != null ? <div key={'a' + b.k} className="st-assigned" style={{ left: Math.min(100, p) + '%' }} title={`${b.name}: está em ${p.toFixed(0)}%`} /> : null })}
    </div>
    <p className="muted small">Faixa marrom = quanto já foi escrito em relação à base · traços = onde cada batida deveria cair · bolinhas = onde você marcou que ela acontece.</p>
    <table className="outliner st-table">
      <thead><tr><th>Batida</th><th className="num">Ideal</th><th>Pela posição, cairia em…</th><th>Cena onde acontece</th><th className="num">Real</th></tr></thead>
      <tbody>{s.beats.map(b => {
        const word = Math.round(ref * b.pct / 100)
        const at = word < total ? sceneAt(word) : undefined
        const real = assigned[b.k] ? posOf(assigned[b.k]) : null
        const diff = real != null ? real - b.pct : null
        return <tr key={b.k}>
          <td><strong>{b.name}</strong>{b.desc && <><br /><small className="muted">{b.desc}</small></>}</td>
          <td className="num">{b.pct}%<br /><small className="muted">~{fmt(word)}</small></td>
          <td>{at ? <button className="linkish" onClick={() => select(at.n.id)}>{at.ch?.title.replace(/^Capítulo\s+/i, 'Cap. ')} › {at.n.title}</button> : <span className="muted">ainda não escrito</span>}</td>
          <td><select value={assigned[b.k] || ''} onChange={e => setBeat(b.k, e.target.value)}>
            <option value="">— marcar cena —</option>
            {scenes.map(x => <option key={x.n.id} value={x.n.id}>{x.ch?.title.replace(/^Capítulo\s+(\d+).*/i, 'Cap. $1')} › {x.n.title}</option>)}
          </select></td>
          <td className="num">{real != null ? <span className={Math.abs(diff!) > 10 ? 'danger-text' : 'ok-text'} title={diff! > 0 ? 'depois do ideal' : 'antes do ideal'}>{real.toFixed(0)}% ({diff! > 0 ? '+' : ''}{diff!.toFixed(0)})</span> : '—'}</td>
        </tr>
      })}</tbody>
    </table>
  </div>
}
