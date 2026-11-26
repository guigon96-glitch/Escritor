import { useEffect, useRef, useState } from 'react'
import { DEFAULT_SYSTEM_PROMPT, LLM_BASE_URL, LLMError, MODES, streamChat, type ChatMessage, type Mode } from '../lib/llm'
import type { BNode } from '../lib/db'
import type { WS } from '../lib/ctx'
import { useWS } from '../lib/ctx'
import { countWords, htmlToText } from '../lib/util'
import { entitiesIn } from '../lib/entities'
import { toast } from './ui'

// shortcut: limites por caracteres (~3k e ~6k tokens), não por tokens; ajuste se mudar o context length (8192 hoje).
const CONTEXT_CHARS = 10000
const TOTAL_CHARS = 21000 // system + histórico; sobra ~1k tokens para a resposta

const charsIn = (nodes: BNode[], text: string) => entitiesIn(nodes, text).filter(n => n.kind === 'character')

/** Lê (sem alterar) a cena aberta: texto inteiro e a seleção atual do editor. */
export function readEditor(ws: WS) {
  const node = ws.selectedId ? ws.byId.get(ws.selectedId) : undefined
  const ed = ws.editorRef.current
  if (!ed || ed.isDestroyed) return { node, full: htmlToText(node?.content || ''), sel: '' }
  const { doc, selection: { from, to } } = ed.state
  return { node, full: doc.textBetween(0, doc.content.size, '\n\n'), sel: from === to ? '' : doc.textBetween(from, to, '\n\n') }
}

/** Mantém a 1ª mensagem (que leva o trecho) e as mais recentes que couberem no orçamento. */
function trimHistory(msgs: ChatMessage[], budget: number): ChatMessage[] {
  const [first, ...rest] = msgs
  const kept: ChatMessage[] = []
  let total = first.content.length
  for (let i = rest.length - 1; i >= 0; i--) {
    total += rest[i].content.length
    if (total > budget) break
    kept.unshift(rest[i])
  }
  return [first, ...kept]
}

/** Aba "Chat" do painel de IA. Só lê o texto; as respostas ficam aqui (Copiar), nunca entram no texto sozinhas. */
export default function AiWriter() {
  const ws = useWS()
  const [mode, setMode] = useState<Mode>('revisao')
  const [input, setInput] = useState('')
  const [temperature, setTemperature] = useState(1.0)
  const [msgs, setMsgs] = useState<ChatMessage[]>([])
  const [about, setAbout] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => { listRef.current?.scrollTo(0, listRef.current.scrollHeight) }, [msgs])

  // vozes ("Jeito de falar" e bordões da ficha) só dos personagens que aparecem no trecho
  const voices = (text: string) => {
    const v = charsIn(ws.nodes, text).filter(c => c.fields.speech?.trim() || c.fields.catchphrases?.trim())
      .map(c => `- ${c.title}: ${[c.fields.speech, c.fields.catchphrases && `bordões: ${c.fields.catchphrases}`].filter(Boolean).join('; ')}`)
    return v.length ? `\n\nComo falam os personagens deste trecho:\n${v.join('\n')}` : ''
  }

  const send = async () => {
    const text = input.trim() || (msgs.length ? '' : MODES[mode].label)
    if (!text || busy) return
    let user = text
    if (!msgs.length) { // o trecho é fixado na 1ª mensagem de cada conversa
      const { node, full, sel } = readEditor(ws)
      const passage = sel || full.slice(-CONTEXT_CHARS)
      setAbout(sel ? `seleção (${countWords(sel)} palavras)` : node ? `cena "${node.title}"` : 'nenhum texto aberto')
      if (passage.trim()) user = `Trecho:\n\n${passage}\n\n---\n\n${text}`
    }
    const history = [...msgs, { role: 'user' as const, content: user }]
    setMsgs([...history, { role: 'assistant', content: '' }]); setInput(''); setError(''); setBusy(true)
    abort.current = new AbortController()
    try {
      const { title, genre, settings: { aiRules } } = ws.project
      // regras do autor por último: têm prioridade sobre as do modo (ex.: humanizar)
      const system = `${DEFAULT_SYSTEM_PROMPT}\n\nLivro: "${title}"${genre ? `, gênero: ${genre}` : ''}.\n\n${MODES[mode].prompt}` +
        (aiRules?.trim() ? `\n\nRegras do autor para este livro. Siga sempre; elas têm prioridade sobre as instruções acima:\n${aiRules.trim()}` : '') +
        voices(history[0].content)
      await streamChat([{ role: 'system', content: system }, ...trimHistory(history, TOTAL_CHARS - system.length)],
        t => setMsgs(m => [...m.slice(0, -1), { role: 'assistant', content: m[m.length - 1].content + t }]),
        { signal: abort.current.signal, temperature })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof LLMError ? e.message : 'Erro inesperado: ' + (e as Error).message)
    } finally { setBusy(false) }
  }

  return <div className="ai-body">
    <div className="row wrap">
      <select value={mode} onChange={e => setMode(e.target.value as Mode)} aria-label="Modo" style={{ width: 'auto' }}>
        {(Object.keys(MODES) as Mode[]).map(k => <option key={k} value={k}>{MODES[k].label}</option>)}
      </select>
      <label className="inline">Temp. {temperature.toFixed(1)} <input type="range" min={1} max={1.2} step={0.1} value={temperature} onChange={e => setTemperature(+e.target.value)} /></label>
      {msgs.length > 0 && !busy && <button onClick={() => { setMsgs([]); setError(''); setAbout('') }}>Nova conversa</button>}
    </div>
    <div ref={listRef} className="ai-scroll" aria-live="polite">
      {msgs.length === 0 && <p className="muted">Selecione um trecho no editor (ou deixe sem seleção para usar a cena inteira), escolha o modo e envie. As respostas ficam aqui; o texto do livro não é alterado. Servidor: {LLM_BASE_URL}</p>}
      {about && <p className="muted">Trecho: {about}</p>}
      {msgs.map((m, i) => m.role === 'user'
        ? <p key={i} className="ai-user">{i === 0 ? m.content.split('\n\n---\n\n').pop() : m.content}</p>
        : <div key={i} className="ai-msg">
          {m.content || <span className="muted">Gerando…</span>}
          {m.content && !(busy && i === msgs.length - 1) && <div className="row" style={{ marginTop: 6 }}>
            <button onClick={() => { navigator.clipboard?.writeText(m.content); toast('Copiado') }}>Copiar</button>
          </div>}
        </div>)}
      {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
    <div className="row">
      <textarea rows={2} value={input} onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
        placeholder={msgs.length ? 'Responder… (Enter envia)' : 'Ex.: "o que falta nesta cena?" (Enter envia)'} />
      {busy ? <button onClick={() => abort.current?.abort()}>■ Parar</button> : <button className="primary" onClick={send}>Enviar</button>}
    </div>
  </div>
}
