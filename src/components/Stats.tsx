import { useLiveQuery } from 'dexie-react-hooks'
import { db, now, today } from '../lib/db'
import { useWS } from '../lib/ctx'
import { childrenOf, descendants, fmt, readingTime, rootByRole, wordsOf } from '../lib/util'
import { LazyInput, Progress } from './ui'

function Bars({ data, color = 'var(--accent)' }: { data: { label: string; value: number; color?: string }[]; color?: string }) {
  const max = Math.max(1, ...data.map(d => d.value))
  return <div className="hbars">
    {data.map((d, i) => <div key={i} className="hbar">
      <span className="hb-l" title={d.label}>{d.label}</span>
      <span className="hb-track"><span style={{ width: (d.value / max * 100) + '%', background: d.color || color }} /></span>
      <span className="hb-v">{fmt(d.value)}</span>
    </div>)}
  </div>
}

export default function Stats() {
  const { project, nodes } = useWS()
  const stats = useLiveQuery(() => db.stats.where('projectId').equals(project.id).sortBy('date'), [project.id]) || []
  const ms = rootByRole(nodes, 'manuscript')
  const scenes = ms ? descendants(nodes, ms.id).filter(n => n.kind === 'text') : []
  const total = scenes.reduce((s, n) => s + wordsOf(n), 0)
  const todayS = stats.find(s => s.date === today())
  const todayW = todayS ? Math.max(0, todayS.endWords - todayS.startWords) : 0

  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (29 - i))
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const s = stats.find(x => x.date === k)
    return { k, d, w: s ? Math.max(0, s.endWords - s.startWords) : 0 }
  })
  const maxDay = Math.max(project.sessionGoal, ...days.map(d => d.w))
  let streak = 0
  for (let i = days.length - 1; i >= 0; i--) { if (days[i].w > 0) streak++; else if (i !== days.length - 1) break }

  let perDay = 0, daysLeft = 0
  if (project.deadline) {
    daysLeft = Math.max(1, Math.ceil((Date.parse(project.deadline + 'T23:59') - Date.now()) / 86400000))
    perDay = Math.max(0, Math.ceil((project.wordGoal - total) / daysLeft))
  }

  const byStatus = project.statuses.map(s => ({ label: s, value: scenes.filter(n => n.status === s).length }))
  const noStatus = scenes.filter(n => !n.status).length
  if (noStatus) byStatus.push({ label: 'Sem status', value: noStatus })
  const povMap = new Map<string, number>()
  scenes.forEach(n => povMap.set(n.pov, (povMap.get(n.pov) || 0) + wordsOf(n)))
  const byPov = [...povMap.entries()].map(([id, v]) => ({ label: id ? nodes.find(n => n.id === id)?.title || '?' : 'Sem POV', value: v })).sort((a, b) => b.value - a.value)
  const byLabel = project.labels.map(l => ({ label: l.name, color: l.color, value: scenes.filter(n => n.labelId === l.id).reduce((s, n) => s + wordsOf(n), 0) })).filter(x => x.value)
  const chapters = ms ? childrenOf(nodes, ms.id).filter(n => n.kind === 'folder').map(c => ({ label: c.title, value: descendants(nodes, c.id).filter(d => d.kind === 'text').reduce((s, d) => s + wordsOf(d), 0) })) : []

  const upd = (p: Partial<typeof project>) => db.projects.update(project.id, { ...p, updatedAt: now() })

  return <div className="stats">
    <div className="fv-head"><div><h2>🎯 Metas e estatísticas</h2><span className="muted">{fmt(total)} palavras · {scenes.length} cenas · ~{Math.round(total / 300)} páginas · {readingTime(total)} de leitura</span></div></div>
    <div className="stat-cards">
      <div className="stat-card">
        <h4>Livro</h4>
        <div className="big-num">{fmt(total)} <small>/ {fmt(project.wordGoal)}</small></div>
        <Progress value={total} max={project.wordGoal} />
        <div className="grid2">
          <label>Meta do livro<LazyInput type="number" value={String(project.wordGoal)} onCommit={v => upd({ wordGoal: +v || 0 })} /></label>
          <label>Prazo<LazyInput type="date" value={project.deadline} onCommit={v => upd({ deadline: v })} /></label>
        </div>
        {project.deadline && <p className="muted">Faltam {daysLeft} dia(s): <b>{fmt(perDay)} palavras/dia</b> para cumprir o prazo.</p>}
      </div>
      <div className="stat-card">
        <h4>Hoje</h4>
        <div className="big-num">{fmt(todayW)} <small>/ {fmt(project.sessionGoal)}</small></div>
        <Progress value={todayW} max={project.sessionGoal} />
        <label>Meta diária<LazyInput type="number" value={String(project.sessionGoal)} onCommit={v => upd({ sessionGoal: +v || 0 })} /></label>
        <p className="muted">🔥 Sequência: <b>{streak}</b> dia(s) escrevendo</p>
      </div>
    </div>

    <h3 className="group-title">Últimos 30 dias</h3>
    <div className="daychart">
      {days.map(d => <div key={d.k} className="dc-col" title={`${d.d.toLocaleDateString('pt-BR')}: ${fmt(d.w)} palavras`}>
        <div className={'dc-bar' + (d.w >= project.sessionGoal && project.sessionGoal ? ' hit' : '')} style={{ height: d.w / maxDay * 160 }} />
        <span>{d.d.getDate()}</span>
      </div>)}
      {project.sessionGoal > 0 && <div className="dc-goal" style={{ bottom: 18 + project.sessionGoal / maxDay * 160 }} title="Meta diária" />}
    </div>

    <div className="stat-cols">
      <div><h3 className="group-title">Palavras por capítulo</h3><Bars data={chapters} /></div>
      <div><h3 className="group-title">Cenas por status</h3><Bars data={byStatus} color="#8b5e34" /></div>
      <div><h3 className="group-title">Palavras por ponto de vista</h3><Bars data={byPov} color="#2980b9" /></div>
      {byLabel.length > 0 && <div><h3 className="group-title">Palavras por rótulo</h3><Bars data={byLabel} /></div>}
    </div>
  </div>
}
