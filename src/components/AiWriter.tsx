import { useEffect, useRef, useState } from 'react'
import type { Editor as TEditor } from '@tiptap/react'
import { DEFAULT_SYSTEM_PROMPT, LLM_BASE_URL, LLM_MODEL, LLMError, MODES, streamChat, type ChatMessage, type Mode } from '../lib/llm'
import { countWords } from '../lib/util'
import { Modal, toast } from './ui'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const toHTML = (t: string) => t.trim().split(/\n\s*\n/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')
// shortcut: limites por caracteres (~3k e ~7k tokens), não por tokens; ajuste se mudar o context length.
const CONTEXT_CHARS = 10000
const HISTORY_CHARS = 24000

/** Mantém a 1ª mensagem (que leva o trecho) e as mais recentes que couberem no orçamento. */
function trimHistory(msgs: ChatMessage[]): ChatMessage[] {
  const [first, ...rest] = msgs
  const kept: ChatMessage[] = []
  let total = first.content.length
  for (let i = rest.length - 1; i >= 0; i--) {
    total += rest[i].content.length
    if (total > HISTORY_CHARS) break
    kept.unshift(rest[i])
  }
  return [first, ...kept]
}

export default function AiWriter({ editor, onClose }: { editor: TEditor; onClose: () => void }) {
  // trecho fixado na abertura: a seleção, ou o texto antes do cursor
  const [sel] = useState(() => {
    const { from, to } = editor.state.selection
    const selected = editor.state.doc.textBetween(from, to, '\n\n')
    return { from, to, selected, passage: selected || editor.state.doc.textBetween(0, from, '\n\n').slice(-CONTEXT_CHARS) }
  })
  const [mode, setMode] = useState<Mode>(sel.selected ? 'revisao' : 'continuar')
  const [input, setInput] = useState('')
  const [temperature, setTemperature] = useState(1.0)
  const [msgs, setMsgs] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => { listRef.current?.scrollTo(0, listRef.current.scrollHeight) }, [msgs])

  const send = async () => {
    const text = input.trim() || (msgs.length ? '' : MODES[mode].label)
    if (!text || busy) return
    const user = msgs.length ? text : (sel.passage.trim() ? `Trecho:\n\n${sel.passage}\n\n---\n\n` : '') + text
    const history = [...msgs, { role: 'user' as const, content: user }]
    setMsgs([...history, { role: 'assistant', content: '' }]); setInput(''); setError(''); setBusy(true)
    abort.current = new AbortController()
    try {
      await streamChat([{ role: 'system', content: `${DEFAULT_SYSTEM_PROMPT}\n\n${MODES[mode].prompt}` }, ...trimHistory(history)],
        t => setMsgs(m => [...m.slice(0, -1), { role: 'assistant', content: m[m.length - 1].content + t }]),
        { signal: abort.current.signal, temperature })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(e instanceof LLMError ? e.message : 'Erro inesperado: ' + (e as Error).message)
    } finally { setBusy(false) }
  }

  const apply = (text: string, replace: boolean) => {
    editor.chain().focus().insertContentAt(replace ? { from: sel.from, to: sel.to } : sel.to, toHTML(text)).run()
    toast(replace ? 'Trecho substituído (Ctrl+Z desfaz)' : 'Texto inserido (Ctrl+Z desfaz)')
    onClose()
  }

  return <Modal title="✨ Assistente de IA (local)" onClose={onClose} wide footer={<>
    <span className="muted">{sel.selected ? `Trecho: seleção (${countWords(sel.selected)} palavras)` : 'Trecho: texto antes do cursor'} · {LLM_MODEL}</span>
    {msgs.length > 0 && !busy && <button onClick={() => { setMsgs([]); setError('') }}>Nova conversa</button>}
  </>}>
    <div className="row wrap">
      <select value={mode} onChange={e => setMode(e.target.value as Mode)} aria-label="Modo">
        {(Object.keys(MODES) as Mode[]).map(k => <option key={k} value={k}>{MODES[k].label}</option>)}
      </select>
      <label className="inline">Temperatura {temperature.toFixed(1)} <input type="range" min={1} max={1.2} step={0.1} value={temperature} onChange={e => setTemperature(+e.target.value)} /></label>
    </div>
    <div ref={listRef} aria-live="polite" style={{ maxHeight: '50vh', overflow: 'auto', margin: '8px 0' }}>
      {msgs.length === 0 && <p className="muted">Escolha um modo e escreva o pedido (ou deixe vazio para só "{MODES[mode].label}"). Servidor: {LLM_BASE_URL}</p>}
      {msgs.map((m, i) => m.role === 'user'
        ? <p key={i} style={{ fontWeight: 600, whiteSpace: 'pre-wrap' }}>{i === 0 && sel.passage.trim() ? m.content.split('\n\n---\n\n').pop() : m.content}</p>
        : <div key={i} style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--ed-font)', borderLeft: '3px solid var(--line)', paddingLeft: 10, marginBottom: 12 }}>
          {m.content || <span className="muted">Gerando…</span>}
          {m.content && !(busy && i === msgs.length - 1) && <div className="row wrap" style={{ marginTop: 6 }}>
            <button onClick={() => apply(m.content, false)}>Inserir no cursor</button>
            {sel.selected && <button onClick={() => apply(m.content, true)}>Substituir seleção</button>}
            <button onClick={() => { navigator.clipboard?.writeText(m.content); toast('Copiado') }}>Copiar</button>
          </div>}
        </div>)}
    </div>
    {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
    <div className="row">
      <textarea rows={2} value={input} onChange={e => setInput(e.target.value)} autoFocus
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
        placeholder={msgs.length ? 'Responder… (Enter envia, Shift+Enter quebra linha)' : 'Ex.: "deixe o diálogo mais tenso", "o que falta nesta cena?"'} />
      {busy ? <button onClick={() => abort.current?.abort()}>■ Parar</button> : <button className="primary" onClick={send}>Enviar</button>}
    </div>
  </Modal>
}
