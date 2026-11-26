// Métricas de prosa medidas no texto (sem IA): o modelo local não sabe contar, o código sabe.
// Limites vindos das regras do revisor anti-IA do autor (por mil palavras, por cena ou por capítulo).
// Sem imports de propósito: dá para testar com node puro.

export interface Metric {
  key: string
  label: string
  value: number          // valor medido (já normalizado pela unidade)
  limit: number          // passou disso, fica vermelho
  minimum?: boolean      // true: o limite é um mínimo (abaixo é ruim)
  unit: string           // "por mil palavras", "no capítulo"…
  hint: string           // o que fazer
  examples: string[]     // trechos encontrados
}

const W = '\\p{L}'
const wordRe = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu
export const countWordsPlain = (t: string) => (t.match(wordRe) || []).length

/** Expressão com borda de palavra que funciona com acentos. */
const words = (alts: string[]) => new RegExp(`(?<!${W})(?:${alts.join('|')})(?!${W})`, 'giu')

function hits(text: string, re: RegExp, filter?: (m: string) => boolean) {
  const out: string[] = []
  let n = 0
  for (const m of text.matchAll(re)) {
    if (filter && !filter(m[0])) continue
    n++
    if (out.length < 5) {
      const i = m.index!
      out.push((i > 40 ? '…' : '') + text.slice(Math.max(0, i - 40), i + m[0].length + 40).replace(/\s+/g, ' ').trim() + '…')
    }
  }
  return { n, examples: out }
}

// verbos em -mente que não são advérbios (lamente, aumente, experimente…)
const NOT_ADVERB = new Set(['semente', 'demente', 'clemente', 'lamente', 'aumente', 'comente', 'alimente', 'experimente', 'atormente', 'cimente', 'fomente', 'documente', 'argumente', 'implemente', 'complemente', 'incremente', 'fragmente', 'sedimente', 'sementes', 'dementes'])
// shortcut: detecção por lista e padrões, sem análise gramatical; pode errar em casos raros.
const FRASES_FEITAS = ['pairava no ar', 'algo dentro dele se partiu', 'algo dentro dela se partiu', 'um misto de', 'o silêncio se estendeu', 'que não sabia que prendia', 'um arrepio percorreu', 'o olhar endureceu', 'gosto de cobre', 'o sangue gelou', 'o coração disparou', 'o tempo parou', 'como se o mundo', 'soltou um suspiro']
const POMPOSAS = ['tapeçaria', 'sinfonia', 'teia de', 'essência', 'âmago', 'legado', 'testemunho de', 'dança de', 'dança das', 'dança dos']
const CONECTIVOS = ['além disso', 'no entanto', 'contudo', 'em suma', 'dessa forma', 'todavia', 'outrossim', 'ademais']
const PT_PT = ['humidade', 'quilómetro', 'quilómetros', 'insectos', 'insecto', 'grémio', 'vómito', 'facto', 'senta-te', 'deixa-me', 'diz-me', 'estás', 'tu estás', 'percebes', 'ecrã', 'casa de banho', 'autocarro', 'rapariga']
const HESITACAO = ['parecia', 'pareciam', 'parecendo', 'como se', 'quase', 'uma espécie de', 'de certa forma', 'meio que']
const FILTRO = ['sentiu', 'sentia', 'viu', 'via', 'ouviu', 'ouvia', 'percebeu', 'percebia', 'notou', 'notava', 'observou']
const CHEIRO = ['cheiro', 'cheiros', 'odor', 'odores', 'fedor', 'fedia', 'cheirava', 'aroma']

/** Calcula as métricas de um capítulo. `scenes` = quantas cenas o capítulo tem. */
export function proseMetrics(text: string, scenes: number): { words: number; metrics: Metric[] } {
  const words_ = Math.max(1, countWordsPlain(text))
  const per1k = (n: number) => Math.round(n / words_ * 1000 * 10) / 10
  const paras = text.split(/\n+/).map(p => p.trim()).filter(Boolean)
  const m: Metric[] = []
  const add = (key: string, label: string, r: { n: number; examples: string[] }, mode: '1k' | 'cena' | 'cap', limit: number, hint: string) =>
    m.push({ key, label, value: mode === '1k' ? per1k(r.n) : mode === 'cena' ? Math.round(r.n / Math.max(1, scenes) * 10) / 10 : r.n, limit, unit: mode === '1k' ? 'por mil palavras' : mode === 'cena' ? 'por cena' : 'no capítulo', hint, examples: r.examples })

  add('mente', 'Advérbios em -mente', hits(text, new RegExp(`(?<!${W})${W}+mente(?!${W})`, 'giu'), w => !NOT_ADVERB.has(w.toLowerCase()) && w.length - 5 >= 4), '1k', 4, 'Troque por um verbo mais preciso ou corte.')
  add('como', 'Comparações com "como um/uma"', hits(text, words(['como uma?', 'como uns', 'como umas'])), '1k', 3, 'Guarde a comparação para a imagem que importa; descreva o resto direto.')
  add('hesita', 'Hesitação ("parecia", "como se", "quase")', hits(text, words(HESITACAO)), '1k', 3, 'Afirme. O POV sabe o que vê.')
  add('filtro', 'Verbos de filtro ("sentiu", "viu", "percebeu")', hits(text, words(FILTRO)), '1k', 3, 'Mostre o estímulo direto, sem "ele viu que".')
  add('naoera', '"Não era X, era Y"', hits(text, new RegExp(`(?<!${W})não (?:era|foi|é|eram|estava)(?!${W})[^.!?\\n]{1,60}?[,;—–-]\\s*(?:era|foi|é|eram|mas|e sim|apenas)(?!${W})`, 'giu')), 'cap', 1, 'Afirme o que é, sem negar o que ninguém disse.')
  add('cheiro', 'Cheiros', hits(text, words(CHEIRO)), 'cena', 1, 'Só quando o cheiro muda a cena ou o perigo.')
  add('feitas', 'Frases feitas', hits(text, words(FRASES_FEITAS)), 'cap', 0, 'Troque pelo detalhe que só esta cena teria.')
  add('pomposas', 'Abstrações pomposas', hits(text, words(POMPOSAS)), 'cap', 0, 'Diga a coisa concreta.')
  add('conectivos', 'Conectivos de redação', hits(text, words(CONECTIVOS)), 'cap', 0, 'Na narração, ligue as frases pela ação, não por "no entanto".')
  add('ptpt', 'Português de Portugal', hits(text, words(PT_PT)), 'cap', 0, 'Use a forma brasileira.')
  add('aspas', 'Diálogo com aspas', { n: paras.filter(p => /^["“]/.test(p)).length, examples: paras.filter(p => /^["“]/.test(p)).slice(0, 5).map(p => p.slice(0, 90) + '…') }, 'cap', 0, 'Diálogo vai com travessão (—).')

  // parágrafos seguidos que começam com a mesma palavra (3 ou mais)
  const first = paras.map(p => (p.replace(/^[—–\-\s"“]+/, '').match(/^\p{L}+/u)?.[0] || '').toLowerCase())
  const runs: string[] = []
  for (let i = 2; i < first.length; i++) if (first[i] && first[i] === first[i - 1] && first[i] === first[i - 2] && (i + 1 >= first.length || first[i + 1] !== first[i])) runs.push(`3+ parágrafos seguidos começando com "${first[i]}": ${paras[i].slice(0, 60)}…`)
  m.push({ key: 'aberturas', label: 'Aberturas repetidas', value: runs.length, limit: 0, unit: 'no capítulo', hint: 'Varie o começo dos parágrafos.', examples: runs.slice(0, 5) })

  // eco: palavra de conteúdo (6+ letras) 3+ vezes no mesmo parágrafo
  const ecos: string[] = []
  for (const p of paras) {
    if (p.startsWith('—')) continue
    const c = new Map<string, number>()
    for (const w of p.toLowerCase().match(/\p{L}{6,}/gu) || []) c.set(w, (c.get(w) || 0) + 1)
    for (const [w, n] of c) if (n >= 3) ecos.push(`"${w}" ${n}x em: ${p.slice(0, 70)}…`)
  }
  m.push({ key: 'eco', label: 'Eco (mesma palavra 3x no parágrafo)', value: ecos.length, limit: 0, unit: 'no capítulo', hint: 'Repita o nome se for clareza; senão, reescreva.', examples: ecos.slice(0, 5) })

  // variação do tamanho das frases (coeficiente de variação): baixo = ritmo monótono
  const sent = text.split(/(?<=[.!?…])\s+/).map(countWordsPlain).filter(n => n > 0)
  const avg = sent.reduce((a, b) => a + b, 0) / Math.max(1, sent.length)
  const sd = Math.sqrt(sent.reduce((a, b) => a + (b - avg) ** 2, 0) / Math.max(1, sent.length))
  const cv = Math.round(sd / Math.max(1, avg) * 100) / 100
  m.push({ key: 'ritmo', label: `Variação das frases (média ${Math.round(avg)} palavras)`, value: cv, limit: 0.45, minimum: true, unit: 'coef. de variação, mínimo', hint: 'Misture frases curtas e longas.', examples: [] })
  return { words: words_, metrics: m }
}

/** true quando a métrica passou do limite. */
export const over = (x: Metric) => x.minimum ? x.value < x.limit : x.value > x.limit

/** Nota automática de higiene: fração das métricas dentro do limite, de 0 a 10. */
export const hygiene = (ms: Metric[]) => Math.round(ms.filter(x => !over(x)).length / ms.length * 100) / 10

/** Divide o texto em partes de até `size` caracteres, cortando em fim de parágrafo. */
export function chunks(text: string, size: number): string[] {
  const out: string[] = []
  let cur = ''
  for (const p of text.split(/\n+/)) {
    if (cur && cur.length + p.length + 2 > size) { out.push(cur); cur = '' }
    cur += (cur ? '\n\n' : '') + p
    while (cur.length > size) { out.push(cur.slice(0, size)); cur = cur.slice(size) }
  }
  if (cur.trim()) out.push(cur)
  return out
}

/** Hash curto para saber se o capítulo mudou desde a última análise. */
export function hash(s: string) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i)
  return (h >>> 0).toString(36)
}
