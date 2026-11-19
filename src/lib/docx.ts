import { AlignmentType, Document, HeadingLevel, Packer, PageBreak, Paragraph, TextRun, Footer, PageNumber } from 'docx'
import { htmlToText, escapeHtml } from './util'

/* ---------- Import ---------- */

export interface ImportedPart { title: string; html: string }

export async function importDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  const buf = await file.arrayBuffer()
  const res = await mammoth.convertToHtml({ arrayBuffer: buf }, {
    styleMap: ["p[style-name='Title'] => h1:fresh", "u => u"]
  })
  return res.value
}

/** Split imported HTML into parts at h1/h2 headings (used to turn a single file into chapters). */
export function splitByHeadings(html: string, fallbackTitle: string): ImportedPart[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstElementChild!
  const parts: ImportedPart[] = []
  let cur: ImportedPart | null = null
  for (const el of Array.from(root.children)) {
    if (/^H[12]$/.test(el.tagName)) {
      cur = { title: el.textContent?.trim() || 'Sem título', html: '' }
      parts.push(cur)
    } else {
      if (!cur) { cur = { title: fallbackTitle, html: '' }; parts.push(cur) }
      cur.html += el.outerHTML
    }
  }
  return parts.filter(p => p.html.trim() || p.title)
}

export async function importTextFile(file: File): Promise<string> {
  const t = await file.text()
  if (/\.html?$/i.test(file.name)) return t
  return t.split(/\r?\n\r?\n/).map(p => `<p>${escapeHtml(p).replace(/\r?\n/g, '<br>')}</p>`).join('')
}

/* ---------- Export / compile ---------- */

export interface CompileItem { kind: 'chapter' | 'scene'; title: string; html: string; depth: number }

export interface CompileOptions {
  title: string
  author: string
  fontFamily: string
  fontSize: number
  lineSpacing: number
  indent: boolean
  titlePage: boolean
  chapterTitles: boolean
  sceneTitles: boolean
  sceneSeparator: string
  chapterPageBreak: boolean
  pageNumbers: boolean
}

interface RunStyle { bold?: boolean; italics?: boolean; underline?: boolean; strike?: boolean; highlight?: boolean }

function inlineRuns(el: Node, style: RunStyle, out: TextRun[], opts: CompileOptions) {
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent || ''
      if (text) out.push(new TextRun({
        text, bold: style.bold, italics: style.italics, strike: style.strike,
        underline: style.underline ? {} : undefined,
        font: opts.fontFamily, size: opts.fontSize * 2
      }))
    } else if (child instanceof HTMLElement) {
      const t = child.tagName
      if (t === 'BR') { out.push(new TextRun({ break: 1 })); continue }
      if (t === 'MARK') continue // annotations are not exported
      const s = { ...style }
      if (t === 'STRONG' || t === 'B') s.bold = true
      if (t === 'EM' || t === 'I') s.italics = true
      if (t === 'U') s.underline = true
      if (t === 'S' || t === 'DEL') s.strike = true
      inlineRuns(child, s, out, opts)
    }
  }
}

function alignOf(el: HTMLElement) {
  const a = el.style.textAlign
  return a === 'center' ? AlignmentType.CENTER : a === 'right' ? AlignmentType.RIGHT : a === 'justify' ? AlignmentType.JUSTIFIED : undefined
}

function htmlToParagraphs(html: string, opts: CompileOptions): Paragraph[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstElementChild!
  const paras: Paragraph[] = []
  const spacing = { line: Math.round(240 * opts.lineSpacing), after: opts.indent ? 0 : 160 }
  let firstInBlock = true
  const push = (el: HTMLElement, extra: Partial<ConstructorParameters<typeof Paragraph>[0] & object> = {}) => {
    const runs: TextRun[] = []
    inlineRuns(el, {}, runs, opts)
    const text = el.textContent?.trim() || ''
    const isSep = text === opts.sceneSeparator || /^(\*\s*){3}$|^#$|^~+$/.test(text)
    if (isSep) {
      paras.push(new Paragraph({ children: [new TextRun({ text: opts.sceneSeparator, font: opts.fontFamily, size: opts.fontSize * 2 })], alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 } }))
      firstInBlock = true
      return
    }
    const align = alignOf(el)
    paras.push(new Paragraph({
      children: runs,
      spacing,
      alignment: align ?? AlignmentType.JUSTIFIED,
      indent: opts.indent && !firstInBlock && !align ? { firstLine: 567 } : undefined,
      ...extra
    }))
    firstInBlock = false
  }
  for (const el of Array.from(root.children) as HTMLElement[]) {
    switch (el.tagName) {
      case 'H1': case 'H2': case 'H3':
        paras.push(new Paragraph({ children: [new TextRun({ text: el.textContent || '', bold: true, font: opts.fontFamily, size: (opts.fontSize + 4) * 2 })], spacing: { before: 240, after: 240 } }))
        firstInBlock = true
        break
      case 'BLOCKQUOTE':
        for (const p of Array.from(el.children) as HTMLElement[]) push(p, { indent: { left: 720, right: 720 } })
        break
      case 'UL': case 'OL':
        Array.from(el.children).forEach((li, i) => {
          const runs: TextRun[] = [new TextRun({ text: el.tagName === 'OL' ? `${i + 1}. ` : '• ', font: opts.fontFamily, size: opts.fontSize * 2 })]
          inlineRuns(li, {}, runs, opts)
          paras.push(new Paragraph({ children: runs, indent: { left: 567 }, spacing }))
        })
        break
      case 'HR':
        paras.push(new Paragraph({ children: [new TextRun({ text: opts.sceneSeparator, font: opts.fontFamily, size: opts.fontSize * 2 })], alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 } }))
        firstInBlock = true
        break
      default:
        push(el)
    }
  }
  return paras
}

export async function compileDocx(items: CompileItem[], opts: CompileOptions): Promise<Blob> {
  const children: Paragraph[] = []
  if (opts.titlePage) {
    children.push(new Paragraph({ spacing: { before: 3600 } }))
    children.push(new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun({ text: opts.title, font: opts.fontFamily, size: 56, bold: true })] }))
    if (opts.author) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 480 }, children: [new TextRun({ text: opts.author, font: opts.fontFamily, size: 32 })] }))
    children.push(new Paragraph({ children: [new PageBreak()] }))
  }
  let firstChapter = true
  let prevWasScene = false
  for (const it of items) {
    if (it.kind === 'chapter') {
      if (opts.chapterPageBreak && !firstChapter) children.push(new Paragraph({ children: [new PageBreak()] }))
      firstChapter = false
      if (opts.chapterTitles) children.push(new Paragraph({
        heading: it.depth <= 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
        alignment: AlignmentType.CENTER,
        spacing: { before: 1200, after: 600 },
        children: [new TextRun({ text: it.title, font: opts.fontFamily, size: (opts.fontSize + 8) * 2, bold: true })]
      }))
      prevWasScene = false
    } else {
      if (prevWasScene && opts.sceneSeparator && !opts.sceneTitles) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 }, children: [new TextRun({ text: opts.sceneSeparator, font: opts.fontFamily, size: opts.fontSize * 2 })] }))
      if (opts.sceneTitles) children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 360, after: 200 }, children: [new TextRun({ text: it.title, font: opts.fontFamily, size: (opts.fontSize + 2) * 2, bold: true })] }))
      children.push(...htmlToParagraphs(it.html, opts))
      prevWasScene = true
    }
  }
  const doc = new Document({
    creator: opts.author,
    title: opts.title,
    styles: { default: { document: { run: { font: opts.fontFamily, size: opts.fontSize * 2 } } } },
    sections: [{
      properties: { page: { margin: { top: 1418, bottom: 1418, left: 1701, right: 1134 } } },
      footers: opts.pageNumbers ? { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT] })] })] }) } : undefined,
      children
    }]
  })
  return Packer.toBlob(doc)
}

export function compileHtml(items: CompileItem[], opts: CompileOptions): string {
  let body = ''
  if (opts.titlePage) body += `<section class="title"><h1>${escapeHtml(opts.title)}</h1><p>${escapeHtml(opts.author)}</p></section>`
  let prevScene = false
  for (const it of items) {
    if (it.kind === 'chapter') {
      body += `<h2 class="chapter">${opts.chapterTitles ? escapeHtml(it.title) : ''}</h2>`
      prevScene = false
    } else {
      if (prevScene && !opts.sceneTitles) body += `<p class="sep">${escapeHtml(opts.sceneSeparator)}</p>`
      if (opts.sceneTitles) body += `<h3>${escapeHtml(it.title)}</h3>`
      body += it.html.replace(/<mark[^>]*>(.*?)<\/mark>/g, '$1')
      prevScene = true
    }
  }
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(opts.title)}</title><style>
  @page { size: A5; margin: 2cm 1.8cm; }
  body { font-family: '${opts.fontFamily}', Georgia, serif; font-size: ${opts.fontSize}px; line-height: ${opts.lineSpacing}; max-width: 40em; margin: 2em auto; color: #111; }
  p { margin: 0 0 ${opts.indent ? 0 : 0.8}em; text-align: justify; ${opts.indent ? 'text-indent: 1.5em;' : ''} }
  h2 + p, h3 + p, .sep + p { text-indent: 0; }
  .title { text-align: center; padding-top: 30vh; page-break-after: always; }
  h2.chapter { text-align: center; margin: 3em 0 2em; ${opts.chapterPageBreak ? 'page-break-before: always;' : ''} }
  .sep { text-align: center; text-indent: 0; margin: 1.2em 0; }
  </style></head><body>${body}</body></html>`
}

export function compileText(items: CompileItem[], opts: CompileOptions, markdown: boolean): string {
  const out: string[] = []
  if (opts.titlePage) out.push(markdown ? `# ${opts.title}\n\n_${opts.author}_` : `${opts.title.toUpperCase()}\n${opts.author}`)
  let prevScene = false
  for (const it of items) {
    if (it.kind === 'chapter') { if (opts.chapterTitles) out.push(markdown ? `## ${it.title}` : `\n${it.title.toUpperCase()}\n`); prevScene = false }
    else {
      if (prevScene && !opts.sceneTitles) out.push(opts.sceneSeparator)
      if (opts.sceneTitles) out.push(markdown ? `### ${it.title}` : it.title)
      out.push(markdown ? htmlToMarkdown(it.html) : htmlToText(it.html))
      prevScene = true
    }
  }
  return out.join('\n\n')
}

function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const inline = (n: Node): string => Array.from(n.childNodes).map(c => {
    if (c.nodeType === Node.TEXT_NODE) return c.textContent || ''
    const e = c as HTMLElement
    const inner = inline(e)
    switch (e.tagName) {
      case 'STRONG': case 'B': return `**${inner}**`
      case 'EM': case 'I': return `*${inner}*`
      case 'S': return `~~${inner}~~`
      case 'BR': return '  \n'
      default: return inner
    }
  }).join('')
  return Array.from(doc.body.firstElementChild!.children).map(e => {
    switch (e.tagName) {
      case 'H1': return `# ${inline(e)}`
      case 'H2': return `## ${inline(e)}`
      case 'H3': return `### ${inline(e)}`
      case 'BLOCKQUOTE': return Array.from(e.children).map(p => `> ${inline(p)}`).join('\n')
      case 'UL': return Array.from(e.children).map(li => `- ${inline(li)}`).join('\n')
      case 'OL': return Array.from(e.children).map((li, i) => `${i + 1}. ${inline(li)}`).join('\n')
      case 'HR': return '* * *'
      default: return inline(e)
    }
  }).join('\n\n')
}

/* ---------- EPUB 3 (e-book) ---------- */
const xesc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** Converte o HTML do editor para XHTML válido (fecha <br>, remove anotações). */
function toXhtml(html: string) {
  const doc = new DOMParser().parseFromString(`<div>${html.replace(/<mark\b[^>]*>[\s\S]*?<\/mark>/g, '')}</div>`, 'text/html')
  return new XMLSerializer().serializeToString(doc.body.firstElementChild!).replace(/^<div[^>]*>|<\/div>$/g, '').replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '')
}

export async function compileEpub(items: CompileItem[], opts: CompileOptions): Promise<Blob> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
  const css = `body{font-family:serif;line-height:1.5;margin:0 5%}p{margin:0;text-indent:${opts.indent ? '1.5em' : '0'};text-align:justify}h1,h2{text-align:center;margin:2em 0 1em}h1+p,h2+p,h3+p,.sep+p{text-indent:0}.sep{text-align:center;text-indent:0;margin:1em 0}.title{text-align:center;margin-top:30%}`
  zip.file('OEBPS/style.css', css)
  // agrupa em arquivos por capítulo
  const chapters: { title: string; body: string }[] = []
  let cur: { title: string; body: string } | null = null
  let prevScene = false
  for (const it of items) {
    if (it.kind === 'chapter' || !cur) {
      cur = { title: it.kind === 'chapter' ? it.title : opts.title, body: it.kind === 'chapter' && opts.chapterTitles ? `<h2>${xesc(it.title)}</h2>` : '' }
      chapters.push(cur); prevScene = false
      if (it.kind === 'chapter') continue
    }
    if (prevScene && !opts.sceneTitles) cur.body += `<p class="sep">${xesc(opts.sceneSeparator)}</p>`
    if (opts.sceneTitles) cur.body += `<h3>${xesc(it.title)}</h3>`
    cur.body += toXhtml(it.html)
    prevScene = true
  }
  const page = (title: string, body: string) => `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="pt-BR"><head><meta charset="UTF-8"/><title>${xesc(title)}</title><link rel="stylesheet" href="style.css"/></head><body>${body}</body></html>`
  const files: { id: string; href: string; title: string }[] = []
  if (opts.titlePage) { zip.file('OEBPS/titulo.xhtml', page(opts.title, `<div class="title"><h1>${xesc(opts.title)}</h1><p>${xesc(opts.author)}</p></div>`)); files.push({ id: 'titulo', href: 'titulo.xhtml', title: opts.title }) }
  chapters.forEach((c, i) => { const href = `cap${String(i + 1).padStart(3, '0')}.xhtml`; zip.file('OEBPS/' + href, page(c.title, c.body)); files.push({ id: 'c' + (i + 1), href, title: c.title }) })
  zip.file('OEBPS/nav.xhtml', page('Sumário', `<nav epub:type="toc" id="toc"><h1>Sumário</h1><ol>${files.map(f => `<li><a href="${f.href}">${xesc(f.title)}</a></li>`).join('')}</ol></nav>`))
  const uidv = 'urn:uuid:' + (crypto.randomUUID ? crypto.randomUUID() : Date.now())
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="pt-BR"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${uidv}</dc:identifier><dc:title>${xesc(opts.title)}</dc:title><dc:creator>${xesc(opts.author || 'Autor')}</dc:creator><dc:language>pt-BR</dc:language><meta property="dcterms:modified">${modified}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>${files.map(f => `<item id="${f.id}" href="${f.href}" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${files.map(f => `<itemref idref="${f.id}"/>`).join('')}</spine></package>`)
  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })
}
