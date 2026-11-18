import type { BNode } from './db'
import { descendants, htmlToText, rootByRole } from './util'

const cache = new Map<string, { content: string; text: string }>()
function plain(n: BNode) {
  const c = cache.get(n.id)
  if (c && c.content === n.content) return c.text
  const text = htmlToText(n.content).toLowerCase()
  cache.set(n.id, { content: n.content, text })
  return text
}

function namesOf(entity: BNode): string[] {
  const names = [entity.title, ...entity.aliases.split(',')]
  if (entity.fields?.fullName) names.push(entity.fields.fullName)
  if (entity.fields?.nickname) names.push(...entity.fields.nickname.split(','))
  return [...new Set(names.map(s => s.trim().toLowerCase()).filter(s => s.length >= 2))]
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export interface Mention { scene: BNode; count: number; tagged: boolean; pov: boolean }

/** Scenes where an entity (character/place/etc.) is mentioned by name or alias, or explicitly tagged. */
export function mentionsOf(all: BNode[], entity: BNode): Mention[] {
  const ms = rootByRole(all, 'manuscript')
  if (!ms) return []
  const names = namesOf(entity)
  const re = names.length ? new RegExp(`(?<![\\p{L}\\p{N}])(${names.map(esc).join('|')})(?![\\p{L}\\p{N}])`, 'gu') : null
  const out: Mention[] = []
  for (const n of descendants(all, ms.id)) {
    if (n.kind !== 'text') continue
    const count = re ? (plain(n).match(re)?.length ?? 0) : 0
    const tagged = n.characterIds.includes(entity.id) || n.locationIds.includes(entity.id)
    const pov = n.pov === entity.id
    if (count || tagged || pov) out.push({ scene: n, count, tagged, pov })
  }
  return out
}
