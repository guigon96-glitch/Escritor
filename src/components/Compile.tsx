import { useState } from 'react'
import { db, now, updateNode, type BNode } from '../lib/db'
import { useWS } from '../lib/ctx'
import { childrenOf, download, rootByRole, safeName, wordsOf, fmt } from '../lib/util'
import { compileDocx, compileEpub, compileHtml, compileText, type CompileItem, type CompileOptions } from '../lib/docx'
import { FONTS } from './Editor'
import { ensureSession, uploadBlob } from '../lib/sync'
import { Modal, toast } from './ui'

type Format = 'docx' | 'epub' | 'pdf' | 'md' | 'txt'

const stripAnnotations = (html: string) => html.replace(/<mark\b[^>]*>[\s\S]*?<\/mark>/g, '')

export default function Compile({ onClose }: { onClose: () => void }) {
  const { project, nodes } = useWS()
  const ms = rootByRole(nodes, 'manuscript')!
  const [fmtSel, setFmt] = useState<Format>('docx')
  const [o, setO] = useState<CompileOptions>({
    title: project.title, author: project.author,
    fontFamily: project.settings.fontFamily === 'Literata' ? 'Times New Roman' : project.settings.fontFamily,
    fontSize: 12, lineSpacing: 1.5, indent: true,
    titlePage: true, chapterTitles: true, sceneTitles: false,
    sceneSeparator: project.settings.sceneSeparator, chapterPageBreak: true, pageNumbers: true
  })
  const [busy, setBusy] = useState(false)

  const collect = (): CompileItem[] => {
    const out: CompileItem[] = []
    const walk = (pid: string, depth: number) => {
      for (const c of childrenOf(nodes, pid)) {
        if (!c.includeInCompile) continue
        if (c.kind === 'folder') { out.push({ kind: 'chapter', title: c.title, html: '', depth }); walk(c.id, depth + 1) }
        else if (c.kind === 'text') { out.push({ kind: 'scene', title: c.title, html: stripAnnotations(c.content), depth }); walk(c.id, depth + 1) }
      }
    }
    walk(ms.id, 1)
    return out
  }

  const run = async (toDrive: boolean) => {
    setBusy(true)
    try {
      const items = collect()
      const base = safeName(o.title)
      let blob: Blob, name: string, mime: string
      if (fmtSel === 'docx') { blob = await compileDocx(items, o); name = base + '.docx'; mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
      else if (fmtSel === 'epub') { blob = await compileEpub(items, o); name = base + '.epub'; mime = 'application/epub+zip' }
      else if (fmtSel === 'pdf') {
        const html = compileHtml(items, o)
        if (!toDrive) {
          const w = window.open('', '_blank')
          if (!w) { toast('Permita pop-ups para gerar o PDF', 'err'); return }
          w.document.write(html + '<script>window.onload=()=>setTimeout(()=>print(),400)</' + 'script>')
          w.document.close()
          toast('Na janela de impressão, escolha “Salvar como PDF”')
          return
        }
        blob = new Blob([html], { type: 'text/html' }); name = base + '.html'; mime = 'text/html'
      }
      else { const md = fmtSel === 'md'; blob = new Blob([compileText(items, o, md)], { type: 'text/plain;charset=utf-8' }); name = base + (md ? '.md' : '.txt'); mime = 'text/plain' }
      if (toDrive) {
        if (!(await ensureSession())) { toast('Conecte o Google Drive primeiro (botão de sincronizar)', 'err'); return }
        await uploadBlob(name, blob, mime); toast(`“${name}” enviado para a pasta Tinteiro no Drive`)
      } else download(name, blob)
      await db.projects.update(project.id, { updatedAt: now() })
    } catch (e: any) { toast('Erro ao exportar: ' + e.message, 'err') } finally { setBusy(false) }
  }

  const tree = (pid: string, depth: number): React.ReactNode => childrenOf(nodes, pid).filter(c => c.kind === 'folder' || c.kind === 'text').map((c: BNode) => <div key={c.id}>
    <label className="inline" style={{ paddingLeft: depth * 16 }}>
      <input type="checkbox" checked={c.includeInCompile} onChange={e => updateNode(c.id, { includeInCompile: e.target.checked })} />
      {c.kind === 'folder' ? '📑' : '📄'} {c.title} {c.kind === 'text' && <small className="muted">{fmt(wordsOf(c))}</small>}
    </label>
    {tree(c.id, depth + 1)}
  </div>)

  const set = <K extends keyof CompileOptions>(k: K, v: CompileOptions[K]) => setO(x => ({ ...x, [k]: v }))
  const total = collect().filter(i => i.kind === 'scene').length

  return <Modal wide title="Exportar / compilar o livro" onClose={onClose} footer={<>
    <span className="muted">{total} cena(s) incluída(s)</span>
    <button disabled={busy} onClick={() => run(true)}>☁ Salvar no Drive</button>
    <button className="primary" disabled={busy} onClick={() => run(false)}>{busy ? 'Gerando…' : '⬇ Baixar'}</button>
  </>}>
    <div className="compile">
      <div>
        <h4>Formato</h4>
        <div className="seg">
          {([['docx', 'Word (.docx)'], ['epub', 'E-book (.epub)'], ['pdf', 'PDF (imprimir)'], ['md', 'Markdown'], ['txt', 'Texto']] as [Format, string][]).filter(([k]) => !(k === 'pdf' && window.tinteiroNative?.platform === 'android')).map(([k, l]) => <button key={k} className={fmtSel === k ? 'on' : ''} onClick={() => setFmt(k)}>{l}</button>)}
        </div>
        <h4>Página</h4>
        <div className="grid2">
          <label>Título<input value={o.title} onChange={e => set('title', e.target.value)} /></label>
          <label>Autor(a)<input value={o.author} onChange={e => set('author', e.target.value)} /></label>
          <label>Fonte<select value={o.fontFamily} onChange={e => set('fontFamily', e.target.value)}>{FONTS.map(f => <option key={f}>{f}</option>)}</select></label>
          <label>Tamanho<input type="number" value={o.fontSize} onChange={e => set('fontSize', +e.target.value || 12)} /></label>
          <label>Entrelinha<select value={o.lineSpacing} onChange={e => set('lineSpacing', +e.target.value)}>{[1, 1.15, 1.5, 2].map(v => <option key={v} value={v}>{v}</option>)}</select></label>
          <label>Separador de cena<input value={o.sceneSeparator} onChange={e => set('sceneSeparator', e.target.value)} /></label>
        </div>
        <label className="inline"><input type="checkbox" checked={o.titlePage} onChange={e => set('titlePage', e.target.checked)} /> Página de rosto</label>
        <label className="inline"><input type="checkbox" checked={o.chapterTitles} onChange={e => set('chapterTitles', e.target.checked)} /> Títulos dos capítulos (nome das pastas)</label>
        <label className="inline"><input type="checkbox" checked={o.sceneTitles} onChange={e => set('sceneTitles', e.target.checked)} /> Títulos das cenas</label>
        <label className="inline"><input type="checkbox" checked={o.chapterPageBreak} onChange={e => set('chapterPageBreak', e.target.checked)} /> Cada capítulo em nova página</label>
        <label className="inline"><input type="checkbox" checked={o.indent} onChange={e => set('indent', e.target.checked)} /> Recuo de primeira linha (padrão de livro)</label>
        <label className="inline"><input type="checkbox" checked={o.pageNumbers} onChange={e => set('pageNumbers', e.target.checked)} /> Numerar páginas (Word)</label>
        <p className="muted">Texto marcado como anotação (🖍) nunca é exportado.</p>
      </div>
      <div>
        <h4>O que incluir</h4>
        <div className="compile-tree">{tree(ms.id, 0)}</div>
      </div>
    </div>
  </Modal>
}
