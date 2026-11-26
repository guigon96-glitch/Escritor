import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import { useWS } from '../lib/ctx'
import { LLMError } from '../lib/llm'
import { chunks } from '../lib/prose'
import { applyPending, fieldOf, pendingKey, setPending, syncEntities, type Pending } from '../lib/entities'
import { readEditor } from './AiWriter'
import { toast } from './ui'

/** Aba "Fichas" do painel de IA: cria/atualiza fichas a partir da cena aberta e mostra os pendentes de revisão. */
export default function AiSync() {
  const ws = useWS()
  const { project, byId } = ws
  const pending = (useLiveQuery(() => db.kv.get(pendingKey(project.id)), [project.id])?.value as Pending[]) || []
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [last, setLast] = useState<{ log: string[]; conflicts: string[] } | null>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const run = async () => {
    const cur = readEditor(ws)
    if (!cur.node || cur.node.kind !== 'text' || !cur.full.trim()) { setError('Abra uma cena com texto no editor e clique de novo.'); return }
    setError(''); setLast(null); abort.current = new AbortController()
    const parts = chunks(cur.full, 6000), all = { log: [] as string[], conflicts: [] as string[] }
    try {
      for (let i = 0; i < parts.length; i++) {
        setBusy(`Lendo "${cur.node.title}", parte ${i + 1} de ${parts.length}…`)
        const r = await syncEntities(project.id, parts[i], `a cena "${cur.node.title}"`, [cur.node.id], abort.current.signal)
        all.log.push(...r.log); all.conflicts.push(...r.conflicts)
      }
      setLast(all)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof LLMError ? e.message : 'Erro inesperado: ' + (e as Error).message)
    } finally { setBusy('') }
  }

  const edit = (id: string, patch: Partial<Pending>) => setPending(project.id, pending.map(p => p.id === id ? { ...p, ...patch } as Pending : p))
  const apply = async () => { const r = await applyPending(project.id); toast(`${r.fieldsN} campo(s) e ${r.eventsN} evento(s) gravados`) }
  const discard = () => setPending(project.id, pending.filter(p => !p.on))
  const marked = pending.filter(p => p.on).length
  const campos = pending.filter(p => p.kind === 'campo' && byId.get(p.nodeId) && !byId.get(p.nodeId)!.deleted) as Extract<Pending, { kind: 'campo' }>[]
  const eventos = pending.filter(p => p.kind === 'evento') as Extract<Pending, { kind: 'evento' }>[]

  return <div className="ai-body">
    <div className="row wrap">
      {busy ? <button onClick={() => abort.current?.abort()}>■ Parar</button> : <button className="primary" onClick={run}>Analisar a cena aberta</button>}
      {pending.length > 0 && <>
        <button className="primary" disabled={!!busy || !marked} onClick={apply}>Aplicar {marked}</button>
        <button disabled={!!busy || !marked} onClick={discard}>Descartar {marked}</button>
      </>}
    </div>
    <div className="ai-scroll">
      <p className="muted">A IA lê o texto e cuida das fichas de personagens e do Mundo (lugares, casas, facções, povos, objetos…). Fichas novas e campos vazios são preenchidos sozinhos; o que muda informação já escrita e os eventos da linha do tempo ficam aqui para você aprovar. O texto do livro nunca é alterado. A aba 🔍 Capítulos faz o mesmo para cada capítulo.</p>
      {busy && <p className="muted" aria-live="polite">{busy}</p>}
      {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
      {last && <>
        <h4>Feito agora</h4>
        {last.log.length === 0 && <p className="muted">Nenhuma ficha nova nem campo vazio para preencher.</p>}
        <ul>{last.log.map((l, i) => <li key={i}>{l}</li>)}</ul>
        {last.conflicts.length > 0 && <><h4 style={{ color: 'var(--danger)' }}>Contradições com as fichas</h4><ul>{last.conflicts.map((l, i) => <li key={i}>{l}</li>)}</ul></>}
      </>}

      <h4>Para revisar ({pending.length})</h4>
      {pending.length === 0 && <p className="muted">Nada pendente.</p>}
      {campos.map(p => {
        const n = byId.get(p.nodeId)!, f = fieldOf(n, p.campo), old = n.fields[p.campo]
        return <div key={p.id} className="ai-item">
          <label className="inline"><input type="checkbox" checked={p.on} onChange={e => edit(p.id, { on: e.target.checked })} /> <b>{n.title}</b> · {f?.label || p.campo}</label>
          {old && <select value={p.append ? 'a' : 's'} onChange={e => edit(p.id, { append: e.target.value === 'a' })} aria-label="Como gravar" style={{ width: 'auto' }}>
            <option value="a">Acrescentar ao valor atual</option><option value="s">Substituir o valor atual</option>
          </select>}
          {old && <small className="muted"> Atual: {old.slice(0, 300)}</small>}
          <textarea rows={2} defaultValue={p.valor} onBlur={e => e.target.value !== p.valor && edit(p.id, { valor: e.target.value })} aria-label={`Novo valor de ${f?.label || p.campo}`} />
          <small className="muted">Origem: {p.origem}{p.motivo && ` · motivo: ${p.motivo}`}</small>
        </div>
      })}
      {eventos.length > 0 && <h4>Linha do tempo</h4>}
      {eventos.map(p => <div key={p.id} className="ai-item">
        <label className="inline"><input type="checkbox" checked={p.on} onChange={e => edit(p.id, { on: e.target.checked })} /> <b>{p.data || 'sem data'}</b> · {p.titulo}</label>
        {p.descricao && <small className="muted">{p.descricao}</small>}
        <small className="muted"> · origem: {p.origem}{[...p.characterIds, ...p.locationIds].length > 0 && ` · ${[...p.characterIds, ...p.locationIds].map(id => byId.get(id)?.title).filter(Boolean).join(', ')}`}</small>
      </div>)}
    </div>
  </div>
}
