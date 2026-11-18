import { useState, type ReactNode } from 'react'
import { updateNode, type BNode } from '../lib/db'
import type { FieldDef, Template } from '../lib/templates'
import { imageToDataUrl, pickFile } from '../lib/util'
import { LazyInput, LazyText, toast } from './ui'

function FieldInput({ f, value, onChange }: { f: FieldDef; value: string; onChange: (v: string) => void }) {
  if (f.type === 'long') return <LazyText value={value} rows={2} placeholder={f.hint} onCommit={onChange} />
  if (f.type === 'select') {
    const custom = value && !f.options!.includes(value)
    return <div className="sel-free">
      <select value={custom ? '__custom' : value} onChange={e => onChange(e.target.value === '__custom' ? ' ' : e.target.value)}>
        <option value="">—</option>
        {f.options!.map(o => <option key={o}>{o}</option>)}
        <option value="__custom">Outro…</option>
      </select>
      {custom && <LazyInput value={value.trim()} placeholder="Escreva" onCommit={v => onChange(v || ' ')} />}
    </div>
  }
  if (f.type === 'scale') {
    const [a, b] = f.label.split('↔').map(s => s.trim())
    return <div className="scale"><span>{a}</span><input type="range" min={0} max={100} value={value || '50'} onChange={e => onChange(e.target.value)} /><span>{b}</span></div>
  }
  return <LazyInput value={value} placeholder={f.hint} onCommit={onChange} />
}

export default function EntitySheet({ node, template, header, extraTabs }: {
  node: BNode
  template: Template
  header?: ReactNode
  extraTabs?: { title: string; render: () => ReactNode }[]
}) {
  const tabs = [...template.sections.map(s => s.title), ...(extraTabs || []).map(t => t.title), 'Campos extras']
  const [tab, setTab] = useState(0)
  const setField = (k: string, v: string) => updateNode(node.id, { fields: { ...node.fields, [k]: v } })
  const filled = (fields: FieldDef[]) => fields.filter(f => node.fields[f.key]?.trim()).length

  const upload = async () => {
    const f = await pickFile('image/*')
    if (!f) return
    try { await updateNode(node.id, { image: await imageToDataUrl(f, node.kind === 'character' ? 700 : 1400) }) } catch { toast('Imagem inválida', 'err') }
  }

  const sec = template.sections[tab]
  const extraIdx = tab - template.sections.length
  return <div className="sheet">
    <div className="sheet-head">
      <div className={'portrait' + (node.kind === 'character' ? ' round' : '')} onClick={upload} title="Trocar imagem">
        {node.image ? <img src={node.image} alt="" /> : <span>{template.icon}<small>Adicionar imagem</small></span>}
      </div>
      <div className="sheet-title">
        <input className="big-title" value={node.title} onChange={e => updateNode(node.id, { title: e.target.value })} placeholder="Nome" />
        {header}
        {node.image && <button className="linkish small" onClick={() => updateNode(node.id, { image: '' })}>remover imagem</button>}
      </div>
    </div>
    <div className="tabs">
      {tabs.map((t, i) => {
        const s = template.sections[i]
        return <button key={t} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>{t}{s ? <small> {filled(s.fields)}/{s.fields.length}</small> : null}</button>
      })}
    </div>
    <div className="sheet-body">
      {sec && <div className="fields">
        {sec.fields.map(f => <label key={f.key} className={f.type === 'long' ? 'wide' : f.type === 'scale' ? 'wide scale-l' : ''}>
          <span>{f.type === 'scale' ? '' : f.label}</span>
          <FieldInput f={f} value={node.fields[f.key] || ''} onChange={v => setField(f.key, v)} />
        </label>)}
      </div>}
      {extraIdx >= 0 && extraIdx < (extraTabs?.length || 0) && extraTabs![extraIdx].render()}
      {tab === tabs.length - 1 && <div className="fields">
        <p className="muted wide">Crie campos próprios para o que os modelos não cobrem.</p>
        {node.customFields.map((cf, i) => <div key={i} className="wide custom-field">
          <LazyInput value={cf.name} placeholder="Nome do campo" onCommit={v => updateNode(node.id, { customFields: node.customFields.map((x, j) => j === i ? { ...x, name: v } : x) })} />
          <LazyText value={cf.value} rows={2} onCommit={v => updateNode(node.id, { customFields: node.customFields.map((x, j) => j === i ? { ...x, value: v } : x) })} />
          <button className="icon" title="Remover campo" onClick={() => updateNode(node.id, { customFields: node.customFields.filter((_, j) => j !== i) })}>🗑</button>
        </div>)}
        <button className="wide" onClick={() => updateNode(node.id, { customFields: [...node.customFields, { name: '', value: '' }] })}>＋ Novo campo</button>
      </div>}
    </div>
  </div>
}
