import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent, type Editor as TEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Typography from '@tiptap/extension-typography'
import { Placeholder, CharacterCount, Focus } from '@tiptap/extensions'
import { DOMSerializer } from '@tiptap/pm/model'
import { useLiveQuery } from 'dexie-react-hooks'
import { blankNode, db, now, today, updateNode, type BNode } from '../lib/db'
import { useWS } from '../lib/ctx'
import { countWords, fmt, readingTime, roleOf } from '../lib/util'
import { Progress, toast } from './ui'
import { CodexHighlight, buildTerms, codexKey, type CodexTerms } from '../lib/codex'
import { templateFor } from '../lib/templates'

export const FONTS = ['Literata', 'Georgia', 'Times New Roman', 'Garamond', 'Palatino Linotype', 'Inter', 'Arial', 'Courier New']

/* ---------- search helpers ---------- */
type Range = { from: number; to: number }
function findAll(editor: TEditor, term: string, matchCase: boolean): Range[] {
  if (!term) return []
  const out: Range[] = []
  const needle = matchCase ? term : term.toLowerCase()
  editor.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    let text = ''
    const map: number[] = []
    node.forEach((child, offset) => {
      if (child.isText) { for (let i = 0; i < child.text!.length; i++) map.push(pos + 1 + offset + i); text += child.text }
      else { text += '￼'; map.push(pos + 1 + offset) }
    })
    const hay = matchCase ? text : text.toLowerCase()
    let i = hay.indexOf(needle)
    while (i !== -1) { out.push({ from: map[i], to: map[i + needle.length - 1] + 1 }); i = hay.indexOf(needle, i + needle.length) }
    return false
  })
  return out
}

function FindBar({ editor, onClose }: { editor: TEditor; onClose: () => void }) {
  const [term, setTerm] = useState('')
  const [rep, setRep] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [idx, setIdx] = useState(0)
  const [count, setCount] = useState(0)
  useEffect(() => { setCount(findAll(editor, term, matchCase).length); setIdx(0) }, [term, matchCase, editor])
  const go = (dir: 1 | -1) => {
    const r = findAll(editor, term, matchCase)
    if (!r.length) return
    const sel = editor.state.selection.from
    let i = dir === 1 ? r.findIndex(x => x.from > sel) : [...r].reverse().findIndex(x => x.from < sel - 1)
    if (dir === -1 && i !== -1) i = r.length - 1 - i
    if (i === -1) i = dir === 1 ? 0 : r.length - 1
    setIdx(i + 1)
    editor.chain().focus().setTextSelection(r[i]).scrollIntoView().run()
  }
  const replaceOne = () => {
    const { from, to } = editor.state.selection
    const selected = editor.state.doc.textBetween(from, to)
    if (selected && (matchCase ? selected === term : selected.toLowerCase() === term.toLowerCase())) editor.chain().focus().insertContentAt({ from, to }, rep).run()
    go(1)
    setCount(findAll(editor, term, matchCase).length)
  }
  const replaceAll = () => {
    const r = findAll(editor, term, matchCase)
    if (!r.length) return
    const tr = editor.state.tr
    for (const x of [...r].reverse()) tr.insertText(rep, x.from, x.to)
    editor.view.dispatch(tr)
    toast(`${r.length} substituição(ões)`)
    setCount(0)
  }
  return <div className="findbar">
    <input autoFocus placeholder="Buscar no documento" value={term} onChange={e => setTerm(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') go(e.shiftKey ? -1 : 1); if (e.key === 'Escape') onClose() }} />
    <span className="muted">{count ? `${idx || '–'}/${count}` : '0'}</span>
    <button onClick={() => go(-1)}>↑</button><button onClick={() => go(1)}>↓</button>
    <input placeholder="Substituir por" value={rep} onChange={e => setRep(e.target.value)} />
    <button onClick={replaceOne}>Substituir</button><button onClick={replaceAll}>Todas</button>
    <label className="inline"><input type="checkbox" checked={matchCase} onChange={e => setMatchCase(e.target.checked)} /> Aa</label>
    <button className="icon" onClick={onClose}>✕</button>
  </div>
}

/* ---------- sprint timer ---------- */
function Sprint({ words }: { words: number }) {
  const [end, setEnd] = useState<number | null>(null)
  const [start, setStart] = useState(0)
  const [, tick] = useState(0)
  const [done, setDone] = useState<string | null>(null)
  useEffect(() => {
    if (!end) return
    const iv = setInterval(() => {
      tick(t => t + 1)
      if (Date.now() >= end) { setEnd(null); setDone(`Sprint concluído: ${fmt(words - start)} palavras!`); navigator.vibrate?.(300) }
    }, 1000)
    return () => clearInterval(iv)
  }, [end, words, start])
  if (end) {
    const left = Math.max(0, end - Date.now())
    return <button className="sprint on" onClick={() => setEnd(null)} title="Parar sprint">⏱ {Math.floor(left / 60000)}:{String(Math.floor(left / 1000) % 60).padStart(2, '0')} · +{fmt(Math.max(0, words - start))}</button>
  }
  return <span className="sprint-wrap">
    {done && <span className="ok-text" onClick={() => setDone(null)}>{done}</span>}
    <select className="sprint" value="" title="Sprint de escrita" onChange={e => { const m = +e.target.value; if (m) { setStart(words); setEnd(Date.now() + m * 60000); setDone(null) } }}>
      <option value="">⏱ Sprint</option>
      {[10, 15, 25, 45, 60].map(m => <option key={m} value={m}>{m} min</option>)}
    </select>
  </span>
}

/* ---------- editor ---------- */
export default function Editor({ node }: { node: BNode }) {
  const ws = useWS()
  const { project, composition, setComposition, recordWords, nodes } = ws
  const s = project.settings
  const saveTimer = useRef<number>(0)
  const pending = useRef<string | null>(null)
  const [finding, setFinding] = useState(false)
  const [words, setWords] = useState(0)
  const [selWords, setSelWords] = useState(0)
  const [focusPara, setFocusPara] = useState(false)
  const [, force] = useState(0)
  const role = roleOf(nodes, node)
  const todayStat = useLiveQuery(() => db.stats.get(`${project.id}:${today()}`), [project.id])
  const [codexOn, setCodexOn] = useState(s.codex !== false)
  const [pop, setPop] = useState<{ id: string; x: number; y: number } | null>(null)
  const entities = useMemo(() => nodes.filter(n => !n.deleted && (n.kind === 'character' || n.kind === 'world') && ['characters', 'world'].includes(roleOf(nodes, n) || '')), [nodes])
  const terms = useRef<CodexTerms | null>(null)
  const termsKey = entities.map(e => e.id + e.title + e.aliases).join('|')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  terms.current = useMemo(() => codexOn ? buildTerms(entities) : null, [termsKey, codexOn])

  const flush = useCallback(() => {
    clearTimeout(saveTimer.current)
    if (pending.current !== null) {
      const html = pending.current
      pending.current = null
      updateNode(node.id, { content: html }).then(() => recordWords())
    }
  }, [node.id, recordWords])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      Typography.configure({ openDoubleQuote: '“', closeDoubleQuote: '”', openSingleQuote: '‘', closeSingleQuote: '’' }),
      Placeholder.configure({ placeholder: role === 'manuscript' ? 'Comece a escrever…' : 'Escreva suas anotações…' }),
      CharacterCount,
      Focus.configure({ className: 'has-focus', mode: 'shallowest' }),
      CodexHighlight.configure({ getTerms: () => terms.current })
    ],
    content: node.content || '',
    editorProps: {
      attributes: { spellcheck: 'true', lang: 'pt-BR' },
      handleTextInput(view, from, _to, text) {
        // "- " or "-- " at the start of a paragraph becomes a dialogue dash (travessão)
        if (text === ' ') {
          const $f = view.state.doc.resolve(from)
          const before = $f.parent.textBetween(0, $f.parentOffset)
          if (before === '-' || before === '--' || before === '–') {
            view.dispatch(view.state.tr.insertText('— ', from - before.length, from))
            return true
          }
        }
        return false
      }
    },
    onCreate: ({ editor }) => setWords(countWords(editor.getText())),
    onUpdate: ({ editor }) => {
      pending.current = editor.getHTML()
      setWords(countWords(editor.getText()))
      clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(flush, 700)
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection
      setSelWords(from === to ? 0 : countWords(editor.state.doc.textBetween(from, to, ' ')))
      force(x => x + 1)
    }
  }, [node.id])

  // painel de IA lê a seleção deste editor
  useEffect(() => {
    ws.editorRef.current = editor
    return () => { if (ws.editorRef.current === editor) ws.editorRef.current = null }
  }, [editor, ws.editorRef])

  // save when leaving
  useEffect(() => () => flush(), [flush])
  useEffect(() => {
    const h = () => flush()
    window.addEventListener('beforeunload', h)
    document.addEventListener('visibilitychange', h)
    return () => { window.removeEventListener('beforeunload', h); document.removeEventListener('visibilitychange', h) }
  }, [flush])

  // external changes (sync from another device, project-wide replace)
  useEffect(() => {
    if (!editor || editor.isFocused || pending.current !== null) return
    if (node.content !== editor.getHTML()) editor.commands.setContent(node.content || '', { emitUpdate: false })
  }, [node.content, editor])

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'f' && !e.shiftKey) { e.preventDefault(); setFinding(true) }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); flush(); toast('Salvo') }
      if (e.key === 'F11' || (mod && e.shiftKey && e.key.toLowerCase() === 'enter')) { e.preventDefault(); setComposition(!composition) }
      if (e.key === 'Escape' && composition) setComposition(false)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [flush, composition, setComposition])

  const splitHere = async () => {
    if (!editor || !node.parentId) return
    const { from } = editor.state.selection
    const end = editor.state.doc.content.size
    const slice = editor.state.doc.slice(from, end)
    const div = document.createElement('div')
    div.appendChild(DOMSerializer.fromSchema(editor.schema).serializeFragment(slice.content))
    editor.chain().deleteRange({ from, to: end }).run()
    flush()
    const sibs = nodes.filter(n => n.parentId === node.parentId && !n.deleted).sort((a, b) => a.order - b.order)
    const next = sibs[sibs.findIndex(n => n.id === node.id) + 1]
    const nn = blankNode({ projectId: project.id, kind: node.kind, parentId: node.parentId, title: node.title + ' (parte 2)', content: div.innerHTML, order: next ? (node.order + next.order) / 2 : node.order + 1, status: node.status, labelId: node.labelId, pov: node.pov })
    await db.nodes.add(nn)
    toast('Cena dividida — a segunda parte foi criada logo abaixo')
  }

  const setSetting = (patch: Partial<typeof s>) => db.projects.update(project.id, { settings: { ...s, ...patch }, updatedAt: now() })

  const style = useMemo(() => ({
    '--ed-font': `'${s.fontFamily}', Georgia, serif`,
    '--ed-size': s.fontSize + 'px',
    '--ed-lh': String(s.lineHeight),
    '--ed-width': s.pageWidth + 'px'
  }) as React.CSSProperties, [s])

  // recalcula destaques quando a enciclopédia muda ou o recurso é ligado/desligado
  useEffect(() => { if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(codexKey, true)) }, [editor, termsKey, codexOn])

  if (!editor) return null
  const today_ = todayStat ? Math.max(0, todayStat.endWords - todayStat.startWords) : 0
  const btn = (label: string, active: boolean, onClick: () => void, title?: string) =>
    <button className={active ? 'on' : ''} title={title} onMouseDown={e => e.preventDefault()} onClick={onClick}>{label}</button>
  const blockType = editor.isActive('heading', { level: 1 }) ? 'h1' : editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'p'

  const popNode = pop ? nodes.find(n => n.id === pop.id) : undefined

  return <div className={'editor-wrap' + (codexOn ? ' codex-on' : '') + (s.indent ? ' indent' : '') + (focusPara ? ' focus-para' : '')} style={style}>
    <div className="ed-toolbar">
      {btn('↶', false, () => editor.chain().focus().undo().run(), 'Desfazer (Ctrl+Z)')}
      {btn('↷', false, () => editor.chain().focus().redo().run(), 'Refazer (Ctrl+Y)')}
      <select value={blockType} onChange={e => {
        const v = e.target.value
        const c = editor.chain().focus()
        if (v === 'p') c.setParagraph().run(); else c.setHeading({ level: +v[1] as 1 | 2 | 3 }).run()
      }}>
        <option value="p">Parágrafo</option><option value="h1">Título 1</option><option value="h2">Título 2</option><option value="h3">Título 3</option>
      </select>
      <span className="sep" />
      {btn('B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Negrito (Ctrl+B)')}
      {btn('I', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Itálico (Ctrl+I)')}
      {btn('U', editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'Sublinhado (Ctrl+U)')}
      {btn('S̶', editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), 'Tachado')}
      {btn('🖍', editor.isActive('highlight'), () => editor.chain().focus().toggleHighlight({ color: '#ffe58a' }).run(), 'Anotação: texto marcado é uma nota sua e NÃO sai na exportação')}
      <span className="sep" />
      {btn('⯇', editor.isActive({ textAlign: 'left' }), () => editor.chain().focus().setTextAlign('left').run(), 'Alinhar à esquerda')}
      {btn('☰', editor.isActive({ textAlign: 'center' }), () => editor.chain().focus().setTextAlign('center').run(), 'Centralizar')}
      {btn('▤', editor.isActive({ textAlign: 'justify' }), () => editor.chain().focus().setTextAlign('justify').run(), 'Justificar')}
      <span className="sep" />
      {btn('•', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), 'Lista')}
      {btn('“”', editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), 'Citação')}
      {btn('—', false, () => editor.chain().focus().insertContent('— ').run(), 'Travessão de diálogo (ou digite "- " no início do parágrafo)')}
      {btn('⁂', false, () => editor.chain().focus().insertContent(`<p style="text-align:center">${s.sceneSeparator}</p><p></p>`).run(), 'Separador de cena')}
      <span className="sep" />
      {btn('🔍', finding, () => setFinding(f => !f), 'Buscar e substituir (Ctrl+F)')}
      {btn('✂', false, splitHere, 'Dividir: o texto a partir do cursor vira uma nova cena')}
      <span className="sep" />
      {btn('A−', false, () => setSetting({ fontSize: Math.max(12, s.fontSize - 1) }), 'Diminuir fonte')}
      {btn('A+', false, () => setSetting({ fontSize: Math.min(32, s.fontSize + 1) }), 'Aumentar fonte')}
      {btn('📇', codexOn, () => { setCodexOn(!codexOn); setSetting({ codex: !codexOn }) }, 'Destacar nomes de personagens e do mundo (toque no nome para ver a ficha)')}
      {btn('◐', focusPara, () => setFocusPara(f => !f), 'Foco no parágrafo: esmaece o resto do texto')}
      {btn(composition ? '⤡' : '⤢', composition, () => setComposition(!composition), 'Modo composição / tela cheia (F11)')}
    </div>
    {finding && <FindBar editor={editor} onClose={() => setFinding(false)} />}
    <div className="ed-scroll" onClick={e => { if (e.target === e.currentTarget) editor.commands.focus('end', { scrollIntoView: false }) }}>
      <div className="page">
        <input className="doc-title" value={node.title} onChange={e => updateNode(node.id, { title: e.target.value })} placeholder="Título" />
        <div onClick={e => {
          const el = (e.target as HTMLElement).closest<HTMLElement>('.codex')
          if (!el) { setPop(null); return }
          const r = el.getBoundingClientRect()
          const host = (e.currentTarget as HTMLElement).closest('.page')!.getBoundingClientRect()
          setPop({ id: el.dataset.codex!, x: Math.min(r.left - host.left, host.width - 300), y: r.bottom - host.top + 6 })
        }}><EditorContent editor={editor} /></div>
        {pop && popNode && <div className="codex-pop" style={{ left: Math.max(8, pop.x), top: pop.y }}>
          <div className="row">
            {popNode.image ? <img src={popNode.image} alt="" /> : <span className="avatar">{popNode.kind === 'character' ? '👤' : templateFor(popNode.template)?.icon || '📘'}</span>}
            <div><strong>{popNode.title}</strong><br /><small className="muted">{popNode.kind === 'character' ? [popNode.fields.role, popNode.fields.age && popNode.fields.age.length < 12 ? popNode.fields.age + ' anos' : ''].filter(Boolean).join(' · ') : templateFor(popNode.template)?.name}</small></div>
          </div>
          {(popNode.fields.concept || popNode.fields.summary) && <p>{(popNode.fields.concept || popNode.fields.summary).slice(0, 220)}</p>}
          <div className="row"><button className="primary" onMouseDown={e => e.preventDefault()} onClick={() => { flush(); ws.select(popNode.id) }}>Abrir ficha</button><button onClick={() => setPop(null)}>Fechar</button></div>
        </div>}
      </div>
    </div>
    <div className="statusbar">
      <span><b>{fmt(words)}</b> palavras{selWords ? ` (${fmt(selWords)} selecionadas)` : ''}</span>
      <span className="muted">{fmt(editor.storage.characterCount.characters())} caracteres · {readingTime(words)} de leitura</span>
      {node.wordTarget > 0 && <span className="st-target">Meta da cena <Progress value={words} max={node.wordTarget} /> {Math.round(words / node.wordTarget * 100)}%</span>}
      <span className="st-target">Hoje: {fmt(today_)}/{fmt(project.sessionGoal)} <Progress value={today_} max={project.sessionGoal} /></span>
      <Sprint words={words} />
    </div>
  </div>
}
