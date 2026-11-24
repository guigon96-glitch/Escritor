import { useState } from 'react'
import { db, now, type Label } from '../lib/db'
import { useWS } from '../lib/ctx'
import { NAME_STYLES, generateName } from '../lib/names'
import { exportBundle, fetchBundle, importAsCopy, ensureSession, listBackups } from '../lib/sync'
import { download, fmtDate, safeName, rootByRole } from '../lib/util'
import Timeline from './Timeline'
import { PlotGrid, StructureView } from './Planning'
import StyleAnalysis from './StyleAnalysis'
import RelationMap from './RelationMap'
import Stats from './Stats'
import Compile from './Compile'
import Search from './Search'
import DriveSetup from './DriveSetup'
import { FONTS } from './Editor'
import { CUSTOM_COLORS, THEMES } from '../lib/themes'
import { LazyInput, Modal, toast } from './ui'
import { AboutUpdates } from './Updates'

export default function Tools() {
  const { tool, setTool, searchQuery } = useWS()
  const close = () => setTool(null)
  switch (tool) {
    case 'timeline': return <Timeline />
    case 'relations': return <RelationMap />
    case 'stats': return <Stats />
    case 'grid': return <PlotGrid />
    case 'structure': return <StructureView />
    case 'style': return <StyleAnalysis />
    case 'compile': return <Compile onClose={close} />
    case 'search': return <Search onClose={close} initial={searchQuery} />
    case 'names': return <NameGen onClose={close} />
    case 'settings': return <Settings onClose={close} />
    default: return null
  }
}

function NameGen({ onClose }: { onClose: () => void }) {
  const { nodes, addNode } = useWS()
  const [style, setStyle] = useState('brasileiro')
  const [gender, setGender] = useState<'m' | 'f' | 'x'>('x')
  const [surname, setSurname] = useState(true)
  const gen = () => Array.from({ length: 12 }, () => generateName(style, gender, surname))
  const [names, setNames] = useState<string[]>(gen)
  const [fav, setFav] = useState<string[]>([])
  const chars = rootByRole(nodes, 'characters')!
  const world = rootByRole(nodes, 'world')!
  return <Modal title="Gerador de nomes" onClose={onClose} wide>
    <div className="row wrap">
      <select value={style} onChange={e => { setStyle(e.target.value) }}>{NAME_STYLES.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}</select>
      <select value={gender} onChange={e => setGender(e.target.value as 'm' | 'f' | 'x')}><option value="x">Qualquer</option><option value="f">Feminino</option><option value="m">Masculino</option></select>
      <label className="inline"><input type="checkbox" checked={surname} onChange={e => setSurname(e.target.checked)} /> com sobrenome</label>
      <button className="primary" onClick={() => setNames(gen())}>🎲 Gerar</button>
    </div>
    <div className="namegrid">
      {names.map((n, i) => <div key={i} className="name-chip">
        <span>{n}</span>
        <button className="icon" title="Guardar" onClick={() => setFav(f => f.includes(n) ? f : [...f, n])}>☆</button>
        <button className="icon" title={style === 'lugar' ? 'Criar lugar' : 'Criar personagem'} onClick={() => { style === 'lugar' ? addNode(world.id, 'world', { template: 'location', title: n }) : addNode(chars.id, 'character', { title: n }); onClose() }}>＋</button>
        <button className="icon" title="Copiar" onClick={() => { navigator.clipboard?.writeText(n); toast('Copiado') }}>⧉</button>
      </div>)}
    </div>
    {fav.length > 0 && <><h4>Guardados</h4><p>{fav.join(' · ')}</p></>}
  </Modal>
}

function Settings({ onClose }: { onClose: () => void }) {
  const { project } = useWS()
  const s = project.settings
  const [drive, setDrive] = useState(false)
  const [backups, setBackups] = useState<{ id: string; name: string; createdTime: string }[] | null>(null)
  const up = (p: Partial<typeof project>) => db.projects.update(project.id, { ...p, updatedAt: now() })
  const ss = (p: Partial<typeof s>) => up({ settings: { ...s, ...p } })
  const setLabel = (i: number, p: Partial<Label>) => up({ labels: project.labels.map((l, j) => j === i ? { ...l, ...p } : l) })

  const backupLocal = async () => {
    const b = await exportBundle(project.id)
    download(`${safeName(project.title)} — backup ${new Date().toISOString().slice(0, 10)}.tinteiro.json`, new Blob([JSON.stringify(b)], { type: 'application/json' }))
  }
  const loadBackups = async () => {
    if (!(await ensureSession())) { toast('Conecte ao Google Drive primeiro', 'err'); return }
    try { setBackups(await listBackups(project.id)) } catch (e: any) { toast(e.message, 'err') }
  }

  return <Modal wide title="Ajustes do projeto" onClose={onClose}>
    <div className="settings">
      <section>
        <h4>Livro</h4>
        <label>Título<LazyInput value={project.title} onCommit={v => up({ title: v })} /></label>
        <label>Autor(a)<LazyInput value={project.author} onCommit={v => up({ author: v })} /></label>
        <label>Gênero<LazyInput value={project.genre} onCommit={v => up({ genre: v })} /></label>
      </section>
      <section>
        <h4>Editor</h4>
        <div className="grid2">
          <label>Fonte<select value={s.fontFamily} onChange={e => ss({ fontFamily: e.target.value })}>{FONTS.map(f => <option key={f}>{f}</option>)}</select></label>
          <label>Tamanho<input type="number" value={s.fontSize} onChange={e => ss({ fontSize: +e.target.value || 18 })} /></label>
          <label>Entrelinha<input type="number" step={0.1} value={s.lineHeight} onChange={e => ss({ lineHeight: +e.target.value || 1.6 })} /></label>
          <label>Largura da página<input type="range" min={480} max={1100} value={s.pageWidth} onChange={e => ss({ pageWidth: +e.target.value })} /></label>
          <label>Separador de cena<input value={s.sceneSeparator} onChange={e => ss({ sceneSeparator: e.target.value })} /></label>
        </div>
        <label className="inline"><input type="checkbox" checked={s.indent} onChange={e => ss({ indent: e.target.checked })} /> Recuo de parágrafo (estilo livro)</label>
      </section>
      <section>
        <h4>Aparência</h4>
        <div className="theme-grid">
          {THEMES.map(t => <button key={t.key} className={'theme-card' + (s.theme === t.key ? ' on' : '')} onClick={() => ss({ theme: t.key })}>
            <span className={`theme-prev theme-${t.key}`} style={{ background: t.swatch[0] }}>
              <span className="tp-page" style={{ background: t.swatch[1], color: t.swatch[2] }}>Aa<i style={{ background: t.swatch[3] }} /></span>
            </span>
            <span>{t.name}</span>
          </button>)}
        </div>
        <h4>Cores personalizadas</h4>
        <div className="row wrap">
          {CUSTOM_COLORS.map(c => <label key={c.key} className="inline color-pick">
            <input type="color" value={s.colors?.[c.key] || THEMES.find(t => t.key === s.theme)!.swatch[({ bg: 0, paper: 1, ink: 2, accent: 3, panel: 0 } as const)[c.key]]} onChange={e => ss({ colors: { ...s.colors, [c.key]: e.target.value } })} /> {c.label}
          </label>)}
          {s.colors && Object.keys(s.colors).length > 0 && <button onClick={() => ss({ colors: {} })}>↺ Usar as cores do tema</button>}
        </div>
      </section>
      <section>
        <h4>Rótulos (cores das cenas)</h4>
        {project.labels.map((l, i) => <div key={l.id} className="row">
          <input type="color" value={l.color} onChange={e => setLabel(i, { color: e.target.value })} />
          <LazyInput value={l.name} onCommit={v => setLabel(i, { name: v })} />
          <button className="icon" onClick={() => up({ labels: project.labels.filter((_, j) => j !== i) })}>🗑</button>
        </div>)}
        <button onClick={() => up({ labels: [...project.labels, { id: 'l' + Date.now(), name: 'Novo rótulo', color: '#888888' }] })}>＋ Rótulo</button>
      </section>
      <section>
        <h4>Status das cenas</h4>
        {project.statuses.map((st, i) => <div key={i} className="row">
          <LazyInput value={st} onCommit={v => up({ statuses: project.statuses.map((x, j) => j === i ? v : x) })} />
          <button className="icon" onClick={() => up({ statuses: project.statuses.filter((_, j) => j !== i) })}>🗑</button>
        </div>)}
        <button onClick={() => up({ statuses: [...project.statuses, 'Novo status'] })}>＋ Status</button>
      </section>
      <section>
        <h4>Sobre e atualizações</h4>
        <AboutUpdates />
      </section>
      <section>
        <h4>Sincronização e backup</h4>
        <p className="muted">{project.lastSync ? `Última sincronização: ${fmtDate(project.lastSync)}` : 'Ainda não sincronizado.'}</p>
        <div className="row wrap">
          <button onClick={() => setDrive(true)}>⚙ Configurar Google Drive</button>
          <button onClick={backupLocal}>⬇ Baixar backup completo (.json)</button>
          <button onClick={loadBackups}>🗂 Backups diários no Drive</button>
        </div>
        {backups && <ul className="list">
          {backups.length === 0 && <li className="muted">Nenhum backup ainda — ele é criado na primeira sincronização de cada dia.</li>}
          {backups.map(b => <li key={b.id}><span>{b.name}</span><button onClick={async () => {
            try { await importAsCopy(await fetchBundle(b.id)); toast('Backup restaurado como um livro separado (“restaurado”). Volte à lista de livros para abri-lo.') } catch (e: any) { toast(e.message, 'err') }
          }}>Restaurar como cópia</button></li>)}
        </ul>}
      </section>
    </div>
    {drive && <DriveSetup onClose={() => setDrive(false)} />}
  </Modal>
}
