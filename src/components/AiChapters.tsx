import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type BNode } from '../lib/db'
import { useWS } from '../lib/ctx'
import { descendants, htmlToText, rootByRole } from '../lib/util'
import { LLMError, extractJSON, streamChat } from '../lib/llm'
import { chunks, hash, hygiene, over, proseMetrics, type Metric } from '../lib/prose'
import { entitiesIn, syncEntities, templateOf } from '../lib/entities'
import { Progress } from './ui'

// O que cada nota mede (vai no prompt e aparece para o autor).
export const CRITERIA = {
  clareza: ['Clareza', 'O leitor entende quem faz o quê, onde e quando, sem reler.'],
  ritmo: ['Ritmo', 'Frases variam com a cena: curtas na ação, longas na atmosfera; nada arrastado nem atropelado.'],
  pov: ['Ponto de vista', 'Um POV por cena, sem pular para a cabeça de outro; o narrador só sabe o que o POV sabe; tempo verbal estável.'],
  dialogo: ['Diálogo', 'Falas naturais, cada personagem com voz própria, sem exposição para o leitor.'],
  mostrar: ['Mostrar x contar', 'Emoção e informação vêm por ação, corpo e detalhe, não por explicação do narrador.'],
  sentidos: ['Detalhe concreto', 'Detalhes sensoriais específicos deste mundo, não genéricos de fantasia.'],
  economia: ['Economia', 'Sem frase que repete o que já foi mostrado, sem enchimento, sem fecho moral.'],
  tensao: ['Tensão', 'Algo está em jogo e piora; a cena tem conflito e consequência.'],
  coerencia: ['Coerência', 'Sem contradição de fatos, nomes, lugares, ferimentos, tempo ou com as fichas dos personagens.'],
  originalidade: ['Originalidade', 'Sem clichês nem vícios de texto de IA (contraste vazio, frase de efeito, trio de adjetivos, palavras pomposas).']
} as const
type Crit = keyof typeof CRITERIA
const KEYS = Object.keys(CRITERIA) as Crit[]
const TIPOS = ['inconsistência', 'ponto de vista', 'tempo verbal', 'diálogo', 'mostrar x contar', 'ritmo', 'clichê ou vício de IA', 'redundância', 'clareza', 'outro']

// shortcut: orçamento por caracteres para contexto de 8192 tokens; aumente PART_CHARS se carregar o modelo com mais contexto.
const PART_CHARS = 6000, RULES_CHARS = 2400, GENRE_CHARS = 1200, FICHA_CHARS = 1800, FACTS_CHARS = 1500

interface Problem { tipo: string; trecho: string; problema: string; sugestao: string }
export interface ChapterAnalysis {
  at: number; hash: string; words: number; metrics: Metric[]
  notas: Record<Crit, { nota: number; motivos: string[] }>
  problemas: Problem[]
  fichas?: string[] // o que a IA criou/preencheu nas fichas ao ler o capítulo
}
const kvKey = (id: string) => 'analise:' + id
const avg = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 10) / 10 : 0
export const overall = (a: ChapterAnalysis) => avg(KEYS.map(k => a.notas[k].nota))
const f1 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const color = (n: number) => n >= 8 ? 'var(--ok, #2e7d32)' : n >= 6 ? 'var(--warn, #b7791f)' : 'var(--danger)'

function chapterText(nodes: BNode[], ch: BNode) {
  const scenes = descendants(nodes, ch.id).filter(n => n.kind === 'text' && n.includeInCompile !== false)
  return { scenes: scenes.length, sceneIds: scenes.map(s => s.id), text: scenes.map(s => htmlToText(s.content)).filter(Boolean).join('\n\n') }
}

export default function AiChapters() {
  const ws = useWS()
  const { project, nodes } = ws
  const ms = rootByRole(nodes, 'manuscript')
  const chapters = ms ? descendants(nodes, ms.id).filter(n => n.kind === 'folder' && descendants(nodes, n.id).some(s => s.kind === 'text')) : []
  const saved = useLiveQuery(() => db.kv.where('key').anyOf(chapters.map(c => kvKey(c.id))).toArray(), [chapters.map(c => c.id).join()]) || []
  const byCh = new Map(saved.map(kv => [kv.key.slice(8), kv.value as ChapterAnalysis]))
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const fresh = (ch: BNode) => { const a = byCh.get(ch.id); return !!a && a.hash === hash(chapterText(nodes, ch).text) }

  async function analyse(ch: BNode, n: number, of: number, signal: AbortSignal) {
    const { scenes, sceneIds, text } = chapterText(nodes, ch)
    if (!text.trim()) return
    const { words, metrics } = proseMetrics(text, scenes)
    const fichas = entitiesIn(nodes, text).map(c => `${c.title}: ${templateOf(c).sections.flatMap(s => s.fields).filter(f => c.fields[f.key]).map(f => `${f.label}: ${c.fields[f.key].slice(0, 120)}`).join('; ')}`).join('\n').slice(0, FICHA_CHARS)
    const rules = (project.settings.aiRules || '').slice(0, RULES_CHARS)
    const genre = (project.settings.aiGenre || '').slice(0, GENRE_CHARS)
    const parts = chunks(text, PART_CHARS)
    const notas = Object.fromEntries(KEYS.map(k => [k, { notas: [] as number[], motivos: [] as string[] }])) as Record<Crit, { notas: number[]; motivos: string[] }>
    const problemas: Problem[] = [], log: string[] = []
    let fatos: string[] = []
    const nota = { type: 'object', additionalProperties: false, required: ['nota', 'motivo'], properties: { nota: { type: 'integer', minimum: 0, maximum: 10 }, motivo: { type: 'string' } } }
    const schema = {
      type: 'object', additionalProperties: false, required: ['notas', 'problemas', 'fatos'],
      properties: {
        notas: { type: 'object', additionalProperties: false, required: KEYS, properties: Object.fromEntries(KEYS.map(k => [k, nota])) },
        problemas: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['tipo', 'trecho', 'problema', 'sugestao'], properties: { tipo: { type: 'string', enum: TIPOS }, trecho: { type: 'string' }, problema: { type: 'string' }, sugestao: { type: 'string' } } } },
        fatos: { type: 'array', maxItems: 10, items: { type: 'string' } }
      }
    }
    for (let i = 0; i < parts.length; i++) {
      setBusy(`Capítulo ${n} de ${of} ("${ch.title}"), parte ${i + 1} de ${parts.length}…`)
      const prompt = `Capítulo "${ch.title}", parte ${i + 1} de ${parts.length}.
${genre ? `\nGênero e convenções do livro (isto é intencional, NÃO é problema):\n${genre}\n` : ''}${rules ? `\nRegras de estilo do autor (avalie a prosa contra elas):\n${rules}\n` : ''}
${fichas ? `\nFichas dos personagens que aparecem (aponte contradição com elas):\n${fichas}\n` : ''}
${fatos.length ? `\nFatos já estabelecidos nas partes anteriores deste capítulo (aponte contradição com eles):\n- ${fatos.join('\n- ')}\n` : ''}
Critérios (nota de 0 a 10; 10 = publicável, 5 = mediano, 0 = falha grave):
${KEYS.map(k => `- ${k} (${CRITERIA[k][0]}): ${CRITERIA[k][1]}`).join('\n')}

Texto:
${parts[i]}

---
Dê uma nota honesta para cada critério, com um motivo curto que cite um exemplo do texto. Seja exigente: não dê 9 ou 10 sem motivo.
Em "problemas", liste até 8 problemas concretos, mais graves primeiro, principalmente inconsistências. "inconsistência" é só contradição de FATO (nome, lugar, ferimento, objeto, tempo, quem está onde) com o próprio texto ou as fichas; nunca é "o personagem deveria agir de outro jeito", falta de compaixão, de punição ou de moral. "trecho" é a frase exata copiada do texto; "sugestao" é como corrigir.
Em "fatos", liste fatos concretos desta parte que precisam ficar coerentes depois (ferimentos, objetos, quem está onde, horário, luz do céu).`
      let out = ''
      await streamChat([
        { role: 'system', content: 'Você é um editor literário exigente de ficção adulta e sombria. Avalia a prosa sem julgamento moral do conteúdo: crueldade, injustiça e personagens sem compaixão são escolhas do autor, não erros. Responde só em JSON.' },
        { role: 'user', content: prompt }
      ], t => { out += t }, { signal, temperature: 0.3, maxTokens: 1500, schema })
      const r = extractJSON<{ notas?: Record<string, { nota?: number; motivo?: string }>; problemas?: Problem[]; fatos?: string[] }>(out)
      for (const k of KEYS) {
        const v = r.notas?.[k]
        if (typeof v?.nota === 'number') notas[k].notas.push(Math.max(0, Math.min(10, v.nota))) // valida o que veio do modelo
        if (v?.motivo?.trim()) notas[k].motivos.push(parts.length > 1 ? `Parte ${i + 1}: ${v.motivo.trim()}` : v.motivo.trim())
      }
      problemas.push(...(r.problemas || []).filter(p => p.problema?.trim()))
      fatos = [...fatos, ...(r.fatos || [])].join('\n').slice(-FACTS_CHARS).split('\n').filter(Boolean)
      setBusy(`Capítulo ${n} de ${of} ("${ch.title}"), parte ${i + 1} de ${parts.length}: atualizando fichas…`)
      const s = await syncEntities(project.id, parts[i], `o capítulo "${ch.title}"`, sceneIds, signal)
      log.push(...s.log)
      problemas.unshift(...s.conflicts.map(c => ({ tipo: 'inconsistência', trecho: '', problema: c, sugestao: 'Corrija o texto ou atualize a ficha (aba 🔄 Fichas).' })))
    }
    const a: ChapterAnalysis = { at: Date.now(), hash: hash(text), words, metrics, problemas, fichas: log, notas: Object.fromEntries(KEYS.map(k => [k, { nota: avg(notas[k].notas), motivos: notas[k].motivos }])) as ChapterAnalysis['notas'] }
    await db.kv.put({ key: kvKey(ch.id), value: a })
  }

  const run = async (list: BNode[]) => {
    setError(''); abort.current = new AbortController()
    try {
      for (let i = 0; i < list.length; i++) await analyse(list[i], i + 1, list.length, abort.current.signal)
      if (list.length === 1) setOpen(list[0].id)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof LLMError ? e.message : 'Erro inesperado: ' + (e as Error).message)
    } finally { setBusy('') }
  }

  const detail = open ? chapters.find(c => c.id === open) : undefined
  const a = detail && byCh.get(detail.id)
  const pending = chapters.filter(c => !fresh(c))

  return <div className="ai-body">
    <div className="row wrap">
      {busy ? <button onClick={() => abort.current?.abort()}>■ Parar</button>
        : <button className="primary" disabled={!pending.length} onClick={() => run(pending)}>{!pending.length ? 'Tudo analisado' : pending.length === chapters.length ? 'Analisar todos' : `Analisar ${pending.length} pendente(s)`}</button>}
      {detail && <button onClick={() => setOpen(null)}>← Todos os capítulos</button>}
    </div>
    <div className="ai-scroll">
      {busy && <p className="muted" aria-live="polite">{busy} (cada parte leva cerca de um minuto)</p>}
      {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
      {!detail && <>
        <p className="muted">Lê cada capítulo, mede os vícios do revisor anti-IA e dá nota a cada critério de prosa, com os problemas e as inconsistências encontrados. Não altera o texto.</p>
        {chapters.length === 0 && <p className="muted">Nenhum capítulo com cenas no Manuscrito.</p>}
        <table className="ai-table">
          <thead><tr><th>Capítulo</th><th title="Média das notas da IA">Prosa</th><th title="Vícios medidos pelo app">Anti-IA</th><th /></tr></thead>
          <tbody>{chapters.map(ch => {
            const r = byCh.get(ch.id)
            return <tr key={ch.id}>
              <td><button className="linkish" onClick={() => setOpen(ch.id)} disabled={!r}>{ch.title}</button>{r && !fresh(ch) && <small className="muted"> (mudou)</small>}</td>
              <td style={{ color: r ? color(overall(r)) : undefined }}>{r ? f1(overall(r)) : '—'}</td>
              <td style={{ color: r ? color(hygiene(r.metrics)) : undefined }}>{r ? f1(hygiene(r.metrics)) : '—'}</td>
              <td><button disabled={!!busy} onClick={() => run([ch])} title="Analisar este capítulo">↻</button></td>
            </tr>
          })}</tbody>
        </table>
      </>}
      {detail && a && <>
        <h3>{detail.title}</h3>
        <p className="muted">{a.words.toLocaleString('pt-BR')} palavras · analisado em {new Date(a.at).toLocaleString('pt-BR')}{!fresh(detail) && ' · o texto mudou depois disso'}</p>
        <p><b style={{ fontSize: 22, color: color(overall(a)) }}>{f1(overall(a))}</b> prosa · <b style={{ color: color(hygiene(a.metrics)) }}>{f1(hygiene(a.metrics))}</b> anti-IA</p>

        <h4>Notas por critério</h4>
        {[...KEYS].sort((x, y) => a.notas[x].nota - a.notas[y].nota).map(k => <details key={k} className="ai-item">
          <summary><b style={{ color: color(a.notas[k].nota) }}>{f1(a.notas[k].nota)}</b> {CRITERIA[k][0]}<Progress value={a.notas[k].nota} max={10} /></summary>
          <small className="muted">{CRITERIA[k][1]}</small>
          <ul>{a.notas[k].motivos.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </details>)}

        <h4>Revisor anti-IA (medido no texto)</h4>
        {a.metrics.map(m => <details key={m.key} className="ai-item">
          <summary style={{ color: over(m) ? 'var(--danger)' : undefined }}>{over(m) ? '✗' : '✓'} {m.label}: <b>{String(m.value).replace('.', ',')}</b> <small className="muted">{m.unit}, limite {String(m.limit).replace('.', ',')}</small></summary>
          <small className="muted">{m.hint}</small>
          {m.examples.length > 0 && <ul>{m.examples.map((e, i) => <li key={i}><button className="linkish" onClick={() => ws.openSearch(e.replace(/^…|…$/g, '').slice(30, 70).trim())}>{e}</button></li>)}</ul>}
        </details>)}

        {!!a.fichas?.length && <details className="ai-item"><summary>Fichas criadas ou preenchidas ao ler ({a.fichas.length})</summary><ul>{a.fichas.map((l, i) => <li key={i}>{l}</li>)}</ul></details>}
        <h4>Problemas e inconsistências ({a.problemas.length})</h4>
        {a.problemas.length === 0 && <p className="muted">Nenhum apontado.</p>}
        {a.problemas.map((p, i) => <div key={i} className="ai-item">
          <b>{p.tipo}</b>: {p.problema}
          {p.trecho && <div><button className="linkish" title="Achar no texto" onClick={() => ws.openSearch(p.trecho.slice(0, 60))}>“{p.trecho}”</button></div>}
          {p.sugestao && <small className="muted">Sugestão: {p.sugestao}</small>}
        </div>)}
      </>}
    </div>
  </div>
}
