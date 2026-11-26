import { useEffect, useRef, useState } from 'react'
import { db, now, uid, type BNode } from '../lib/db'
import { useWS } from '../lib/ctx'
import { CHARACTER_TEMPLATE } from '../lib/templates'
import { roleOf } from '../lib/util'
import { LLMError, extractJSON, streamChat } from '../lib/llm'
import { Modal, toast } from './ui'

// Só campos de texto livre: selects e escalas têm valores fixos que o modelo erraria.
const FIELDS = CHARACTER_TEMPLATE.sections.flatMap(s => s.fields).filter(f => !f.type || f.type === 'text' || f.type === 'long')
const LABEL = Object.fromEntries(FIELDS.map(f => [f.key, f.label]))
const LONG = new Set(FIELDS.filter(f => f.type === 'long').map(f => f.key))
// shortcut: orçamento por caracteres pensado para contexto de 8k–12k tokens; aumente se carregar o modelo com mais contexto.
const SCENE_CHARS = 10000, FIELD_CHARS = 200, CHAR_CHARS = 800, MAX_CHARS = 8

type Ficha = { personagem: string; campo: string; valor: string; motivo: string }
type Evento = { titulo: string; data: string; descricao: string; personagens: string[] }
type Item<T> = T & { on: boolean; append?: boolean }

const names = (c: BNode) => [c.title, c.fields.fullName || '', ...c.aliases.split(',')].map(s => s.trim()).filter(s => s.length > 1)

export default function AiSync({ node, text, onClose }: { node: BNode; text: string; onClose: () => void }) {
  const { project, nodes } = useWS()
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [fichas, setFichas] = useState<Item<Ficha>[] | null>(null)
  const [eventos, setEventos] = useState<Item<Evento>[]>([])
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const scene = text.slice(0, SCENE_CHARS)
  const low = scene.toLowerCase()
  const chars = nodes.filter(n => n.kind === 'character' && !n.deleted && roleOf(nodes, n) === 'characters' && names(n).some(s => low.includes(s.toLowerCase()))).slice(0, MAX_CHARS)
  // refs curtas (P1, P2…) no lugar dos ids: o modelo copia melhor
  const ref = Object.fromEntries(chars.map((c, i) => [`P${i + 1}`, c]))

  const run = async () => {
    setBusy(true); setError(''); setProgress(0); setFichas(null)
    abort.current = new AbortController()
    const events = await db.events.where('projectId').equals(project.id).filter(e => !e.deleted).sortBy('sortKey')
    const refs = Object.keys(ref)
    const charBlock = refs.map(r => {
      const c = ref[r]
      const filled = FIELDS.filter(f => c.fields[f.key]).map(f => `${f.key}: ${c.fields[f.key].slice(0, FIELD_CHARS)}`).join('; ').slice(0, CHAR_CHARS)
      return `${r}: ${c.title}${c.aliases ? ` (também chamado: ${c.aliases})` : ''}\n  ficha atual: ${filled || '(vazia)'}`
    }).join('\n')
    const prompt = `Personagens citados na cena:\n${charBlock || '(nenhum personagem cadastrado aparece na cena)'}

Campos da ficha (chave = significado): ${FIELDS.map(f => `${f.key} = ${f.label}`).join('; ')}

Eventos que já estão na linha do tempo:\n${events.slice(-40).map(e => `- ${e.date || 'sem data'}: ${e.title}`).join('\n') || '(nenhum)'}

Cena "${node.title}":\n${scene}

---
Leia a cena e proponha atualizações para as fichas e a linha do tempo.
- fichas: só fatos que a cena mostra de forma explícita e que a ficha atual ainda não tem ou que mudaram (idade revelada, ferimento novo, segredo exposto, mudança de objetivo, nova relação...). "valor" é só a informação nova, curta, sem repetir o que a ficha já diz. "motivo" cita o trecho da cena que justifica. Não invente nem deduza além do texto.
- eventos: acontecimentos importantes da cena que ainda não estão na linha do tempo. "data" como aparece na história, ou vazia se a cena não disser. "personagens" usa as referências P1, P2...
- Se nada mudou, devolva listas vazias.`
    const pRef = refs.length ? { type: 'string', enum: refs } : { type: 'string' }
    const schema = {
      type: 'object', additionalProperties: false, required: ['fichas', 'eventos'],
      properties: {
        fichas: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['personagem', 'campo', 'valor', 'motivo'], properties: { personagem: pRef, campo: { type: 'string', enum: FIELDS.map(f => f.key) }, valor: { type: 'string' }, motivo: { type: 'string' } } } },
        eventos: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['titulo', 'data', 'descricao', 'personagens'], properties: { titulo: { type: 'string' }, data: { type: 'string' }, descricao: { type: 'string' }, personagens: { type: 'array', items: pRef } } } }
      }
    }
    let out = ''
    try {
      // temperatura baixa: aqui é extração de fatos, não escrita criativa
      await streamChat([
        { role: 'system', content: 'Você é um assistente de continuidade para um romancista. Extrai fatos de cenas de ficção (inclusive adulta e sombria) sem julgamentos morais e responde só em JSON.' },
        { role: 'user', content: prompt }
      ], t => { out += t; setProgress(out.length) }, { signal: abort.current.signal, temperature: 0.3, maxTokens: 1500, schema })
      const r = extractJSON<{ fichas?: Ficha[]; eventos?: Evento[] }>(out)
      // valida o que veio do modelo antes de mostrar/gravar
      setFichas((r.fichas || []).filter(f => ref[f.personagem] && LABEL[f.campo] && f.valor?.trim()).map(f => ({ ...f, on: true, append: LONG.has(f.campo) })))
      setEventos((r.eventos || []).filter(e => e.titulo?.trim()).map(e => ({ ...e, personagens: (e.personagens || []).filter(p => ref[p]), on: true })))
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof LLMError ? e.message : 'Erro inesperado: ' + (e as Error).message)
    } finally { setBusy(false) }
  }

  const apply = async () => {
    const chosen = (fichas || []).filter(f => f.on && f.valor.trim())
    for (const c of new Set(chosen.map(f => ref[f.personagem].id))) {
      const fresh = await db.nodes.get(c) // relê do banco para não sobrescrever edições recentes
      if (!fresh) continue
      const fields = { ...fresh.fields }
      for (const f of chosen.filter(f => ref[f.personagem].id === c)) {
        const old = (fields[f.campo] || '').trim()
        fields[f.campo] = f.append && old ? `${old}\n\n${f.valor.trim()}` : f.valor.trim()
      }
      await db.nodes.update(c, { fields, updatedAt: now() })
    }
    const evs = eventos.filter(e => e.on)
    let key = ((await db.events.where('projectId').equals(project.id).filter(e => !e.deleted).sortBy('sortKey')).at(-1)?.sortKey ?? 0)
    for (const e of evs) {
      key += 10
      await db.events.add({ id: uid(), projectId: project.id, title: e.titulo.trim(), date: e.data.trim(), sortKey: key, description: e.descricao.trim(), color: '#2980b9', nodeIds: [node.id], characterIds: e.personagens.map(p => ref[p].id), locationIds: [], updatedAt: now() })
    }
    toast(`${chosen.length} campo(s) de ficha e ${evs.length} evento(s) atualizados`)
    onClose()
  }

  const setF = (i: number, p: Partial<Item<Ficha>>) => setFichas(fs => fs!.map((f, j) => j === i ? { ...f, ...p } : f))
  const setE = (i: number, p: Partial<Item<Evento>>) => setEventos(es => es.map((e, j) => j === i ? { ...e, ...p } : e))
  const total = (fichas?.filter(f => f.on).length || 0) + eventos.filter(e => e.on).length

  return <Modal title="🔄 Atualizar fichas e linha do tempo com IA" onClose={onClose} wide footer={<>
    {busy ? <button onClick={() => abort.current?.abort()}>■ Parar</button> : <button className={fichas ? '' : 'primary'} onClick={run}>{fichas ? 'Analisar de novo' : 'Analisar cena'}</button>}
    {fichas && <button className="primary" disabled={busy || !total} onClick={apply}>Aplicar {total} selecionado(s)</button>}
  </>}>
    <p className="muted">A IA lê a cena "{node.title}" e sugere o que mudou. Nada é gravado até você aplicar. Personagens encontrados na cena: {chars.map(c => c.title).join(', ') || 'nenhum'}.</p>
    {busy && <p className="muted">Analisando… ({progress} caracteres recebidos)</p>}
    {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
    {fichas && <>
      <h4>Fichas</h4>
      {fichas.length === 0 && <p className="muted">Nenhuma mudança nas fichas.</p>}
      {fichas.map((f, i) => {
        const c = ref[f.personagem]
        return <div key={i} style={{ borderLeft: '3px solid var(--line)', paddingLeft: 10, marginBottom: 10 }}>
          <label className="inline"><input type="checkbox" checked={f.on} onChange={e => setF(i, { on: e.target.checked })} /> <b>{c.title}</b> · {LABEL[f.campo]}</label>
          {c.fields[f.campo] && <select value={f.append ? 'a' : 's'} onChange={e => setF(i, { append: e.target.value === 'a' })} aria-label="Como gravar" style={{ width: 'auto' }}>
            <option value="a">Acrescentar ao valor atual</option><option value="s">Substituir o valor atual</option>
          </select>}
          {c.fields[f.campo] && <small className="muted">Atual: {c.fields[f.campo].slice(0, 300)}</small>}
          <textarea rows={2} value={f.valor} onChange={e => setF(i, { valor: e.target.value })} aria-label={`Novo valor de ${LABEL[f.campo]}`} />
          {f.motivo && <small className="muted">Motivo: {f.motivo}</small>}
        </div>
      })}
      <h4>Linha do tempo</h4>
      {eventos.length === 0 && <p className="muted">Nenhum evento novo.</p>}
      {eventos.map((e, i) => <div key={i} style={{ borderLeft: '3px solid var(--line)', paddingLeft: 10, marginBottom: 10 }}>
        <label className="inline"><input type="checkbox" checked={e.on} onChange={ev => setE(i, { on: ev.target.checked })} /> <b>{e.data || 'sem data'}</b> · {e.titulo}</label>
        {e.descricao && <small className="muted">{e.descricao}</small>}
        {e.personagens.length > 0 && <small className="muted"> · {e.personagens.map(p => ref[p].title).join(', ')}</small>}
      </div>)}
    </>}
  </Modal>
}
