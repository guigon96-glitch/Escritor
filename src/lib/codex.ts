import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { BNode } from './db'

export interface CodexTerms { re: RegExp; map: Map<string, string> }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Monta a expressão com nomes e apelidos de personagens e entradas do mundo. */
export function buildTerms(entities: BNode[]): CodexTerms | null {
  const map = new Map<string, string>()
  for (const e of entities) {
    const names = [e.title, ...e.aliases.split(','), e.fields?.fullName || '']
    for (const raw of names) {
      const n = raw.trim()
      if (n.length < 3 || /\(|\)/.test(n)) continue
      const k = n.toLowerCase()
      if (!map.has(k)) map.set(k, e.id)
    }
  }
  if (!map.size) return null
  const alts = [...map.keys()].sort((a, b) => b.length - a.length).map(esc)
  return { re: new RegExp(`(?<![\\p{L}\\p{N}])(${alts.join('|')})(?![\\p{L}\\p{N}])`, 'giu'), map }
}

export const codexKey = new PluginKey<DecorationSet>('codex')

function decorate(doc: PMNode, terms: CodexTerms | null): DecorationSet {
  if (!terms) return DecorationSet.empty
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    terms.re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = terms.re.exec(node.text))) {
      const id = terms.map.get(m[0].toLowerCase())
      if (id) decos.push(Decoration.inline(pos + m.index, pos + m.index + m[0].length, { class: 'codex', 'data-codex': id }))
    }
  })
  return DecorationSet.create(doc, decos)
}

/** Destaca no editor os nomes conhecidos; `getTerms` é lido a cada mudança. */
export const CodexHighlight = Extension.create<{ getTerms: () => CodexTerms | null }>({
  name: 'codexHighlight',
  addOptions() { return { getTerms: () => null } },
  addProseMirrorPlugins() {
    const opts = this.options
    return [new Plugin<DecorationSet>({
      key: codexKey,
      state: {
        init: (_, { doc }) => decorate(doc, opts.getTerms()),
        apply: (tr, old) => tr.docChanged || tr.getMeta(codexKey) ? decorate(tr.doc, opts.getTerms()) : old.map(tr.mapping, tr.doc)
      },
      props: { decorations(state) { return codexKey.getState(state) } }
    })]
  }
})
