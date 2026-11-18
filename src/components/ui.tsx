import { useEffect, useRef, useState, type ReactNode } from 'react'

export function Modal({ title, onClose, children, wide, footer }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-label={title}>
        <header><h2>{title}</h2><button className="icon" onClick={onClose} aria-label="Fechar">✕</button></header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  )
}

/** Text input that only commits on blur/Enter, to avoid writing to the DB on every keystroke. */
export function LazyInput({ value, onCommit, placeholder, className, autoFocus, type = 'text' }: { value: string; onCommit: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean; type?: string }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <input type={type} className={className} value={v} placeholder={placeholder} autoFocus={autoFocus}
    onChange={e => setV(e.target.value)}
    onBlur={() => v !== value && onCommit(v)}
    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
}

/** Debounced auto-growing textarea. */
export function LazyText({ value, onCommit, placeholder, rows = 3, className }: { value: string; onCommit: (v: string) => void; placeholder?: string; rows?: number; className?: string }) {
  const [v, setV] = useState(value)
  const timer = useRef<number>(0)
  const latest = useRef(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (value !== latest.current) { setV(value); latest.current = value } }, [value])
  useEffect(() => {
    const el = ref.current
    if (el) { el.style.height = 'auto'; el.style.height = Math.max(el.scrollHeight, rows * 22) + 'px' }
  }, [v, rows])
  const commit = (nv: string) => { latest.current = nv; onCommit(nv) }
  return <textarea ref={ref} className={className} value={v} rows={rows} placeholder={placeholder}
    onChange={e => {
      const nv = e.target.value
      setV(nv)
      clearTimeout(timer.current)
      timer.current = window.setTimeout(() => commit(nv), 500)
    }}
    onBlur={() => { clearTimeout(timer.current); if (v !== latest.current) commit(v) }} />
}

export function Confirm({ text, onYes, onNo, yes = 'Confirmar', danger }: { text: string; onYes: () => void; onNo: () => void; yes?: string; danger?: boolean }) {
  return <Modal title="Confirmar" onClose={onNo} footer={<><button onClick={onNo}>Cancelar</button><button className={danger ? 'danger' : 'primary'} onClick={onYes}>{yes}</button></>}>
    <p>{text}</p>
  </Modal>
}

export function Progress({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return <div className="progress" title={label}>
    <div className={'bar' + (pct >= 100 ? ' done' : '')} style={{ width: pct + '%' }} />
  </div>
}

let toastFn: ((m: string, kind?: 'ok' | 'err') => void) | null = null
export const toast = (m: string, kind: 'ok' | 'err' = 'ok') => toastFn?.(m, kind)

export function Toaster() {
  const [items, setItems] = useState<{ id: number; m: string; kind: string }[]>([])
  useEffect(() => {
    toastFn = (m, kind = 'ok') => {
      const id = Date.now() + Math.random()
      setItems(x => [...x, { id, m, kind }])
      setTimeout(() => setItems(x => x.filter(i => i.id !== id)), kind === 'err' ? 15000 : 3500)
    }
    return () => { toastFn = null }
  }, [])
  return <div className="toaster">{items.map(i => <div key={i.id} className={'toast ' + i.kind}>{i.m}</div>)}</div>
}

export function Menu({ x, y, items, onClose }: { x: number; y: number; items: ({ label: string; onClick: () => void; danger?: boolean } | '-')[]; onClose: () => void }) {
  useEffect(() => {
    const c = () => onClose()
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    setTimeout(() => window.addEventListener('click', c), 0)
    window.addEventListener('blur', c)
    window.addEventListener('keydown', k)
    return () => { window.removeEventListener('click', c); window.removeEventListener('blur', c); window.removeEventListener('keydown', k) }
  }, [onClose])
  const left = Math.min(x, window.innerWidth - 230)
  const top = Math.min(y, window.innerHeight - items.length * 34 - 16)
  return <div className="menu" style={{ left, top }}>
    {items.map((it, i) => it === '-' ? <hr key={i} /> :
      <button key={i} className={it.danger ? 'danger-text' : ''} onClick={() => { onClose(); it.onClick() }}>{it.label}</button>)}
  </div>
}

export function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [t, setT] = useState('')
  const add = () => { const s = t.trim(); if (s && !value.includes(s)) onChange([...value, s]); setT('') }
  return <div className="tags">
    {value.map(k => <span key={k} className="tag">{k}<button onClick={() => onChange(value.filter(x => x !== k))} aria-label="remover">×</button></span>)}
    <input value={t} placeholder={placeholder} onChange={e => setT(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }} onBlur={add} />
  </div>
}

export function MultiPick({ options, value, onChange, placeholder }: { options: { id: string; title: string }[]; value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const sel = options.filter(o => value.includes(o.id))
  const rest = options.filter(o => !value.includes(o.id))
  return <div className="tags">
    {sel.map(o => <span key={o.id} className="tag">{o.title}<button onClick={() => onChange(value.filter(x => x !== o.id))} aria-label="remover">×</button></span>)}
    {options.length === 0 && <span className="muted" style={{ padding: '0 6px', fontSize: 13 }}>nada cadastrado ainda</span>}
    {rest.length > 0 && <select value="" onChange={e => e.target.value && onChange([...value, e.target.value])}>
      <option value="">{placeholder}</option>
      {rest.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
    </select>}
  </div>
}
