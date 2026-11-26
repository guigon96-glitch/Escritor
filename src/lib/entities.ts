// Fichas automáticas: a IA lê um trecho e cria/atualiza fichas de personagens e do Mundo.
// O que é seguro entra sozinho (ficha nova, campo vazio); o que mexe em informação existente
// e os eventos da linha do tempo vão para a lista de pendentes, que o autor revisa.
import { blankNode, db, now, uid, type BNode } from './db'
import { CHARACTER_TEMPLATE, WORLD_TEMPLATES, templateFor, type FieldDef, type Template } from './templates'
import { roleOf, rootByRole } from './util'
import { extractJSON, streamChat } from './llm'

export const TYPES = ['personagem', ...WORLD_TEMPLATES.map(t => t.key)] as const
const typeName = (t: string) => t === 'personagem' ? 'Personagem' : templateFor(t)?.name || t
/** Só campos de texto livre: selects e escalas têm valores fixos que o modelo erraria. */
const textFields = (t: Template): FieldDef[] => t.sections.flatMap(s => s.fields).filter(f => !f.type || f.type === 'text' || f.type === 'long')
const ALL_TEMPLATES = [CHARACTER_TEMPLATE, ...WORLD_TEMPLATES]
const ALL_KEYS = [...new Set(ALL_TEMPLATES.flatMap(t => textFields(t).map(f => f.key)))]
export const templateOf = (n: BNode) => n.kind === 'character' ? CHARACTER_TEMPLATE : templateFor(n.template) || templateFor('lore')!
export const fieldOf = (n: BNode, key: string) => textFields(templateOf(n)).find(f => f.key === key)

export const entityNames = (c: BNode) => [c.title, c.fields.fullName || '', ...c.aliases.split(',')].map(s => s.trim()).filter(s => s.length > 1)
export const isEntity = (nodes: BNode[], n: BNode) => !n.deleted && ((n.kind === 'character' && roleOf(nodes, n) === 'characters') || (n.kind === 'world' && roleOf(nodes, n) === 'world'))
/** Fichas (personagens e Mundo) cujo nome aparece no texto. */
export function entitiesIn(nodes: BNode[], text: string) {
  const low = text.toLowerCase()
  return nodes.filter(n => isEntity(nodes, n) && entityNames(n).some(s => low.includes(s.toLowerCase())))
}

export type Pending =
  | { id: string; kind: 'campo'; on: boolean; nodeId: string; campo: string; valor: string; motivo: string; append: boolean; origem: string }
  | { id: string; kind: 'evento'; on: boolean; titulo: string; data: string; descricao: string; nodeIds: string[]; characterIds: string[]; locationIds: string[]; origem: string }
export const pendingKey = (projectId: string) => 'ia:pendentes:' + projectId
export async function getPending(projectId: string) { return ((await db.kv.get(pendingKey(projectId)))?.value as Pending[]) || [] }
export const setPending = (projectId: string, p: Pending[]) => db.kv.put({ key: pendingKey(projectId), value: p })

// shortcut: orçamento por caracteres para contexto de 8192 tokens (texto ≤ 6000 caracteres por chamada).
const FIELD_CHARS = 150, ENTITY_CHARS = 700, MAX_ENTITIES = 10, NAMES_CHARS = 1500

type Raw = {
  atualizacoes?: { ref: string; campo: string; valor: string; motivo: string }[]
  novos?: { tipo: string; nome: string; resumo: string; detalhes?: { campo: string; valor: string }[]; motivo: string }[]
  eventos?: { titulo: string; data: string; descricao: string; envolvidos?: string[] }[]
}

/**
 * Lê um trecho (até ~6000 caracteres), cria fichas novas, preenche campos vazios e manda o resto para os pendentes.
 * Devolve o que fez (log) e as contradições com fichas existentes (conflitos).
 */
export async function syncEntities(projectId: string, text: string, origem: string, sceneIds: string[], signal: AbortSignal) {
  const nodes = await db.nodes.where('projectId').equals(projectId).toArray()
  const present = entitiesIn(nodes, text).slice(0, MAX_ENTITIES)
  const ref = Object.fromEntries(present.map((n, i) => [`E${i + 1}`, n])) // refs curtas: o modelo copia melhor que ids
  const refs = Object.keys(ref)
  const allNames = nodes.filter(n => isEntity(nodes, n)).map(n => n.title).join(', ').slice(0, NAMES_CHARS)
  const events = (await db.events.where('projectId').equals(projectId).filter(e => !e.deleted).sortBy('sortKey')).slice(-30)
  const prompt = `Fichas que aparecem no trecho:
${refs.map(r => { const n = ref[r]; const filled = textFields(templateOf(n)).filter(f => n.fields[f.key]).map(f => `${f.key}: ${n.fields[f.key].slice(0, FIELD_CHARS)}`).join('; ').slice(0, ENTITY_CHARS); return `${r}: ${n.title} [${n.kind === 'character' ? 'Personagem' : templateOf(n).name}] ficha atual: ${filled || '(vazia)'}` }).join('\n') || '(nenhuma)'}

Já cadastrados (NÃO crie de novo): ${allNames || '(nada)'}

Campos de cada tipo de ficha (chave=significado):
${ALL_TEMPLATES.map((t, i) => `${i ? t.key : 'personagem'} (${t.name}): ${textFields(t).map(f => `${f.key}=${f.label}`).join('; ')}`).join('\n')}

Eventos já na linha do tempo: ${events.map(e => `${e.date || 'sem data'}: ${e.title}`).join(' | ') || '(nenhum)'}

Trecho:
${text}

---
Extraia do trecho o que deve ir para as fichas. Só fatos explícitos no texto; não invente nem deduza.
- atualizacoes: fatos novos sobre fichas que já existem (ref E1, E2...). "campo" tem que ser do tipo daquela ficha. "valor" é só a informação nova, curta. "motivo" cita o trecho.
- novos: personagens com nome, casas, famílias, facções, lugares, povos, objetos, criaturas e eventos históricos que têm nome próprio no trecho e ainda não estão cadastrados. Escolha o "tipo" certo (casa nobre ou família = organization; cidade, região ou construção = location). "resumo" diz em uma frase quem ou o que é. "detalhes" só com o que o trecho diz.
- eventos: acontecimentos importantes do trecho que ainda não estão na linha do tempo; "envolvidos" usa as refs.
- Se não houver nada, devolva listas vazias.`
  const refProp = refs.length ? { type: 'string', enum: refs } : { type: 'string' }
  const schema = {
    type: 'object', additionalProperties: false, required: ['atualizacoes', 'novos', 'eventos'],
    properties: {
      atualizacoes: { type: 'array', maxItems: 12, items: { type: 'object', additionalProperties: false, required: ['ref', 'campo', 'valor', 'motivo'], properties: { ref: refProp, campo: { type: 'string', enum: ALL_KEYS }, valor: { type: 'string' }, motivo: { type: 'string' } } } },
      novos: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['tipo', 'nome', 'resumo', 'detalhes', 'motivo'], properties: { tipo: { type: 'string', enum: TYPES }, nome: { type: 'string' }, resumo: { type: 'string' }, detalhes: { type: 'array', maxItems: 6, items: { type: 'object', additionalProperties: false, required: ['campo', 'valor'], properties: { campo: { type: 'string', enum: ALL_KEYS }, valor: { type: 'string' } } } }, motivo: { type: 'string' } } } },
      eventos: { type: 'array', maxItems: 5, items: { type: 'object', additionalProperties: false, required: ['titulo', 'data', 'descricao', 'envolvidos'], properties: { titulo: { type: 'string' }, data: { type: 'string' }, descricao: { type: 'string' }, envolvidos: { type: 'array', items: refProp } } } }
    }
  }
  let out = ''
  // temperatura baixa: extração de fatos, não escrita criativa
  await streamChat([
    { role: 'system', content: 'Você é um assistente de continuidade para um romancista. Extrai fatos de ficção (inclusive adulta e sombria) sem julgamentos morais e responde só em JSON.' },
    { role: 'user', content: prompt }
  ], t => { out += t }, { signal, temperature: 0.3, maxTokens: 1500, schema })
  return applyExtraction(projectId, extractJSON<Raw>(out), ref, origem, sceneIds)
}

/** Grava o que é seguro e enfileira o resto. Valida tudo o que veio do modelo. Exportada para teste. */
export async function applyExtraction(projectId: string, r: Raw, ref: Record<string, BNode>, origem: string, sceneIds: string[]) {
  const log: string[] = [], conflicts: string[] = [], pending = await getPending(projectId)
  const nodes = await db.nodes.where('projectId').equals(projectId).toArray() // relê: não sobrescreve edições recentes
  const known = new Set(nodes.filter(n => isEntity(nodes, n)).flatMap(entityNames).map(s => s.toLowerCase()))
  const chars = rootByRole(nodes, 'characters'), world = rootByRole(nodes, 'world')

  for (const c of r.novos || []) {
    const nome = c.nome?.trim()
    if (!nome || known.has(nome.toLowerCase()) || !(TYPES as readonly string[]).includes(c.tipo)) continue
    const isChar = c.tipo === 'personagem'
    const parent = isChar ? chars : world
    if (!parent) continue
    const t = isChar ? CHARACTER_TEMPLATE : templateFor(c.tipo)!
    const keys = new Set(textFields(t).map(f => f.key))
    const fields: Record<string, string> = {}
    for (const d of c.detalhes || []) if (keys.has(d.campo) && d.valor?.trim()) fields[d.campo] = d.valor.trim()
    if (c.resumo?.trim()) fields[isChar ? 'concept' : keys.has('summary') ? 'summary' : textFields(t)[0].key] = c.resumo.trim()
    await db.nodes.add(blankNode({ projectId, kind: isChar ? 'character' : 'world', parentId: parent.id, title: nome, template: isChar ? '' : c.tipo, fields, notes: `Criada pela IA ao ler ${origem}.` }))
    known.add(nome.toLowerCase())
    log.push(`Nova ficha: ${nome} (${typeName(c.tipo)})`)
  }

  const touched = new Map<string, Record<string, string>>()
  for (const u of r.atualizacoes || []) {
    const n0 = ref[u.ref], valor = u.valor?.trim()
    if (!n0 || !valor || !fieldOf(n0, u.campo)) continue
    const n = nodes.find(x => x.id === n0.id)
    if (!n) continue
    const fields = touched.get(n.id) || { ...n.fields }
    const old = (fields[u.campo] || '').trim()
    const f = fieldOf(n, u.campo)!
    if (!old) { fields[u.campo] = valor; touched.set(n.id, fields); log.push(`${n.title} · ${f.label}: ${valor}`); continue }
    if (old.toLowerCase().includes(valor.toLowerCase())) continue
    const isLong = f.type === 'long'
    if (!isLong) conflicts.push(`Ficha de ${n.title} diz "${f.label}: ${old}", mas o texto indica "${valor}" (${u.motivo || origem}).`)
    if (pending.some(p => p.kind === 'campo' && p.nodeId === n.id && p.campo === u.campo && p.valor.toLowerCase() === valor.toLowerCase())) continue // já na fila
    pending.push({ id: uid(), kind: 'campo', on: true, nodeId: n.id, campo: u.campo, valor, motivo: u.motivo || '', append: isLong, origem })
  }
  for (const [id, fields] of touched) await db.nodes.update(id, { fields, updatedAt: now() })

  const seen = new Set([...pending.flatMap(p => p.kind === 'evento' ? [p.titulo] : []), ...(await db.events.where('projectId').equals(projectId).filter(e => !e.deleted).toArray()).map(e => e.title)].map(t => t.toLowerCase()))
  for (const e of r.eventos || []) {
    if (!e.titulo?.trim() || seen.has(e.titulo.trim().toLowerCase())) continue // já na fila ou na linha do tempo
    seen.add(e.titulo.trim().toLowerCase())
    const inv = (e.envolvidos || []).map(x => ref[x]).filter(Boolean)
    pending.push({ id: uid(), kind: 'evento', on: true, titulo: e.titulo.trim(), data: e.data?.trim() || '', descricao: e.descricao?.trim() || '', nodeIds: sceneIds, characterIds: inv.filter(n => n.kind === 'character').map(n => n.id), locationIds: inv.filter(n => n.kind === 'world').map(n => n.id), origem })
  }
  await setPending(projectId, pending)
  return { log, conflicts }
}

/** Aplica os pendentes marcados e tira da lista. */
export async function applyPending(projectId: string) {
  const all = await getPending(projectId)
  const chosen = all.filter(p => p.on)
  let fieldsN = 0, eventsN = 0
  for (const p of chosen) {
    if (p.kind === 'campo') {
      const n = await db.nodes.get(p.nodeId)
      if (!n || n.deleted || !p.valor.trim()) continue
      const old = (n.fields[p.campo] || '').trim()
      await db.nodes.update(n.id, { fields: { ...n.fields, [p.campo]: p.append && old ? `${old}\n\n${p.valor.trim()}` : p.valor.trim() }, updatedAt: now() })
      fieldsN++
    } else {
      const last = (await db.events.where('projectId').equals(projectId).filter(e => !e.deleted).sortBy('sortKey')).at(-1)?.sortKey ?? 0
      await db.events.add({ id: uid(), projectId, title: p.titulo, date: p.data, sortKey: last + 10, description: p.descricao, color: '#2980b9', nodeIds: p.nodeIds, characterIds: p.characterIds, locationIds: p.locationIds, updatedAt: now() })
      eventsN++
    }
  }
  await setPending(projectId, all.filter(p => !p.on))
  return { fieldsN, eventsN }
}
