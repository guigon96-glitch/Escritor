import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, now, uid, type TimelineEvent } from '../lib/db'
import { useWS } from '../lib/ctx'
import { descendants, roleOf, rootByRole } from '../lib/util'
import { LazyInput, LazyText, Modal, MultiPick } from './ui'

const COLORS = ['#c0392b', '#d35400', '#f1c40f', '#27ae60', '#16a085', '#2980b9', '#8e44ad', '#7f8c8d']

export default function Timeline() {
  const { project, nodes, select } = useWS()
  const events = useLiveQuery(() => db.events.where('projectId').equals(project.id).filter(e => !e.deleted).sortBy('sortKey'), [project.id]) || []
  const [edit, setEdit] = useState<TimelineEvent | null>(null)
  const [who, setWho] = useState('')
  const [showScenes, setShowScenes] = useState(true)
  const [view, setView] = useState<'vertical' | 'horizontal'>('vertical')
  const [lanes, setLanes] = useState<'personagens' | 'lugares' | 'unica'>('personagens')
  useEffect(() => { db.kv.get('tlView').then(kv => kv?.value && setView(kv.value as 'vertical' | 'horizontal')) }, [])
  const changeView = (v: 'vertical' | 'horizontal') => { setView(v); db.kv.put({ key: 'tlView', value: v }) }
  const chars = nodes.filter(n => n.kind === 'character' && !n.deleted && roleOf(nodes, n) === 'characters').map(n => ({ id: n.id, title: n.title }))
  const places = nodes.filter(n => (n.kind === 'world' || n.kind === 'map') && !n.deleted && roleOf(nodes, n) === 'world').map(n => ({ id: n.id, title: n.title }))
  const ms = rootByRole(nodes, 'manuscript')
  const scenes = ms ? descendants(nodes, ms.id).filter(n => n.kind === 'text') : []
  const sceneOpts = scenes.map(s => ({ id: s.id, title: s.title }))
  const datedScenes = scenes.filter(s => s.storyDate && (!who || s.pov === who || s.characterIds.includes(who)))

  const add = async () => {
    const e: TimelineEvent = { id: uid(), projectId: project.id, title: 'Novo evento', date: '', sortKey: (events.at(-1)?.sortKey ?? 0) + 10, description: '', color: COLORS[5], nodeIds: [], characterIds: [], locationIds: [], updatedAt: now() }
    await db.events.add(e)
    setEdit(e)
  }
  const save = (id: string, patch: Partial<TimelineEvent>) => {
    db.events.update(id, { ...patch, updatedAt: now() })
    setEdit(e => e && e.id === id ? { ...e, ...patch } : e)
  }
  const swap = async (i: number, d: -1 | 1) => {
    const a = events[i], b = events[i + d]
    if (!a || !b) return
    await db.events.update(a.id, { sortKey: b.sortKey, updatedAt: now() })
    await db.events.update(b.id, { sortKey: a.sortKey, updatedAt: now() })
  }
  const shown = events.filter(e => !who || e.characterIds.includes(who))

  return <div className="timeline-view">
    <div className="fv-head">
      <div><h2>🕰 Linha do tempo</h2><span className="muted">A cronologia da história (não a ordem do livro). Use para flashbacks, idades e eventos do passado.</span></div>
      <div className="row wrap">
        <select value={who} onChange={e => setWho(e.target.value)}><option value="">Todos os personagens</option>{chars.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
        <div className="seg">
          <button className={view === 'vertical' ? 'on' : ''} onClick={() => changeView('vertical')}>↕ Vertical</button>
          <button className={view === 'horizontal' ? 'on' : ''} onClick={() => changeView('horizontal')}>↔ Horizontal</button>
        </div>
        {view === 'horizontal' && <select value={lanes} onChange={e => setLanes(e.target.value as typeof lanes)} title="Faixas">
          <option value="personagens">Faixas por personagem</option><option value="lugares">Faixas por lugar</option><option value="unica">Faixa única</option>
        </select>}
        {view === 'vertical' && <label className="inline"><input type="checkbox" checked={showScenes} onChange={e => setShowScenes(e.target.checked)} /> mostrar cenas com data</label>}
        <button className="primary" onClick={add}>＋ Evento</button>
      </div>
    </div>
    {view === 'horizontal' && <HorizontalTimeline events={shown} lanes={lanes} onEdit={setEdit} onSwap={(e, d) => swap(events.indexOf(e), d)} />}
    {view === 'vertical' && <div className="tl2">
      {shown.length === 0 && <p className="muted">Nenhum evento ainda.</p>}
      {shown.map((e, j) => {
        const i = events.indexOf(e)
        return <div key={e.id} className={'tl2-item ' + (j % 2 ? 'right' : 'left')}>
          <div className="tl2-card" style={{ borderTopColor: e.color }} onClick={() => setEdit(e)}>
            <div className="tl2-date" style={{ color: e.color }}>{e.date || 'sem data'}</div>
            <strong>{e.title}</strong>
            {e.description && <p>{e.description}</p>}
            <div className="chips small">
              {e.characterIds.map(id => <span key={id}>👤 {nodes.find(n => n.id === id)?.title}</span>)}
              {e.locationIds.map(id => <span key={id}>📍 {nodes.find(n => n.id === id)?.title}</span>)}
              {e.nodeIds.map(id => <span key={id} className="linkish" onClick={ev => { ev.stopPropagation(); select(id) }}>📄 {nodes.find(n => n.id === id)?.title}</span>)}
            </div>
            <div className="tl2-move" onClick={ev => ev.stopPropagation()}>
              <button className="icon" onClick={() => swap(i, -1)} title="Mais cedo">▲</button>
              <button className="icon" onClick={() => swap(i, 1)} title="Mais tarde">▼</button>
            </div>
          </div>
          <div className="tl2-axis"><span className="tl2-num" style={{ background: e.color }}>{i + 1}</span></div>
          <div className="tl2-spacer" />
        </div>
      })}
    </div>}
    {view === 'vertical' && showScenes && datedScenes.length > 0 && <>
      <h3 className="group-title">Cenas com “data na história” (pelo Inspetor)</h3>
      <table className="outliner"><tbody>
        {datedScenes.map(s => <tr key={s.id}><td style={{ width: 200 }}><b>{s.storyDate}</b></td><td><button className="linkish" onClick={() => select(s.id)}>{s.title}</button></td><td className="muted">{s.synopsis}</td></tr>)}
      </tbody></table>
    </>}
    {edit && <Modal title="Evento" onClose={() => setEdit(null)} footer={<>
      <button className="danger" onClick={() => { save(edit.id, { deleted: true }); setEdit(null) }}>Excluir</button>
      <button className="primary" onClick={() => setEdit(null)}>Pronto</button>
    </>}>
      <label>Título<LazyInput value={edit.title} onCommit={v => save(edit.id, { title: v })} /></label>
      <label>Data / época (texto livre)<LazyInput value={edit.date} placeholder="Ex.: 12 anos antes · Ano 1042 da Era do Sol · Verão de 1998" onCommit={v => save(edit.id, { date: v })} /></label>
      <label>Descrição<LazyText value={edit.description} rows={3} onCommit={v => save(edit.id, { description: v })} /></label>
      <label>Cor<div className="row">{COLORS.map(c => <button key={c} className={'swatch' + (edit.color === c ? ' on' : '')} style={{ background: c }} onClick={() => save(edit.id, { color: c })} />)}</div></label>
      <label>Personagens<MultiPick options={chars} value={edit.characterIds} placeholder="+ personagem" onChange={v => save(edit.id, { characterIds: v })} /></label>
      <label>Lugares<MultiPick options={places} value={edit.locationIds} placeholder="+ lugar" onChange={v => save(edit.id, { locationIds: v })} /></label>
      <label>Cenas relacionadas<MultiPick options={sceneOpts} value={edit.nodeIds} placeholder="+ cena" onChange={v => save(edit.id, { nodeIds: v })} /></label>
    </Modal>}
  </div>
}

function HorizontalTimeline({ events, lanes, onEdit, onSwap }: { events: TimelineEvent[]; lanes: 'personagens' | 'lugares' | 'unica'; onEdit: (e: TimelineEvent) => void; onSwap: (e: TimelineEvent, d: -1 | 1) => void }) {
  const { nodes, select } = useWS()
  const title = (id: string) => nodes.find(n => n.id === id)?.title || '?'
  const keyOf = (e: TimelineEvent) => lanes === 'personagens' ? e.characterIds : lanes === 'lugares' ? e.locationIds : ['*']
  // faixas na ordem de mais eventos
  const count = new Map<string, number>()
  events.forEach(e => keyOf(e).forEach(k => count.set(k, (count.get(k) || 0) + 1)))
  const laneIds = [...count.keys()].sort((a, b) => (count.get(b)! - count.get(a)!))
  const orphans = events.some(e => keyOf(e).length === 0)
  const rows: { id: string; label: string; image?: string }[] = [
    ...laneIds.map(id => ({ id, label: id === '*' ? 'Linha do tempo' : title(id), image: nodes.find(n => n.id === id)?.image })),
    ...(orphans ? [{ id: '', label: lanes === 'personagens' ? 'Sem personagem' : 'Sem lugar' }] : [])
  ]
  const [zoom, setZoom] = useState(200)
  const [hover, setHover] = useState<string | null>(null)
  useEffect(() => { db.kv.get('tlZoom').then(kv => kv?.value && setZoom(kv.value as number)) }, [])
  if (!events.length) return <p className="muted">Nenhum evento ainda.</p>
  const cols = `minmax(140px, 180px) repeat(${events.length}, ${zoom}px)`
  const LANE = ['#c0392b', '#2471a3', '#17a589', '#b9770e', '#7d3c98', '#d35490', '#27ae60', '#e67e22', '#5d6d7e', '#16a085']
  const other = (e: TimelineEvent) => lanes === 'personagens' ? e.locationIds.map(id => '📍 ' + title(id)) : lanes === 'lugares' ? e.characterIds.map(id => '👤 ' + title(id)) : [...e.characterIds.map(id => '👤 ' + title(id)), ...e.locationIds.map(id => '📍 ' + title(id))]
  return <>
  <label className="inline muted htl-zoom">Zoom <input type="range" min={130} max={340} value={zoom} onChange={e => { setZoom(+e.target.value); db.kv.put({ key: 'tlZoom', value: +e.target.value }) }} /></label>
  <div className="htl-wrap">
    <div className="htl" style={{ gridTemplateColumns: cols }}>
      <div className="htl-corner" />
      {events.map((e, i) => <div key={e.id} className={'htl-head' + (hover === e.id ? ' hov' : '')} onMouseEnter={() => setHover(e.id)} onMouseLeave={() => setHover(null)}>
        <div className="htl-axis"><span className="htl-dot" style={{ background: e.color }}>{i + 1}</span></div>
        <div className="htl-date" title={e.date}>{e.date || 'sem data'}</div>
        <div className="htl-move"><button className="icon" title="Mais cedo" onClick={() => onSwap(e, -1)}>◀</button><button className="icon" title="Mais tarde" onClick={() => onSwap(e, 1)}>▶</button></div>
      </div>)}
      {rows.map((r, ri) => {
        const color = r.id ? LANE[ri % LANE.length] : '#999'
        const hits = events.map(e => r.id === '' ? keyOf(e).length === 0 : keyOf(e).includes(r.id))
        const first = hits.indexOf(true), last = hits.lastIndexOf(true)
        return <div key={r.id} className="htl-row" style={{ display: 'contents', ['--lane' as string]: color }}>
        <div className="htl-lane" style={{ borderLeftColor: color }} onClick={() => r.id && r.id !== '*' && select(r.id)}>
          {r.image ? <img src={r.image} alt="" /> : <span className="avatar">{r.label[0]}</span>}<span>{r.label}</span>
        </div>
        {events.map((e, i) => {
          const hit = hits[i]
          const span = i >= first && i <= last && first !== last ? (i === first ? ' span-start' : i === last ? ' span-end' : ' span') : ''
          return <div key={e.id} className={'htl-cell' + (hit ? ' hit' : '') + span + (hover === e.id ? ' hov' : '')} onMouseEnter={() => setHover(e.id)} onMouseLeave={() => setHover(null)}>
            {hit && <div className="htl-card" style={{ borderTopColor: e.color }} onClick={() => onEdit(e)}>
              <strong>{e.title}</strong>
              {e.description && <p>{e.description.length > zoom / 2 ? e.description.slice(0, Math.round(zoom / 2)) + '…' : e.description}</p>}
              {other(e).length > 0 && <div className="chips small">{other(e).slice(0, 3).map(t => <span key={t}>{t}</span>)}</div>}
            </div>}
          </div>
        })}
      </div>})}
    </div>
  </div>
  </>
}
