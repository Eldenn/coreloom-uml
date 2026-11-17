// The rules of an agent role's fields, as the catalog's `roleSchema` checks them: rights and
// what each needs, limits, identifiers. Pure, so the form says them before the API does.
import type { AgentConfig } from '@/lib/agent-configs'

export type Right = AgentConfig['roles'][number]['rights'][number]

/** Every right, in the catalog's order. */
export const RIGHTS = [
  'read',
  'write',
  'run-checks',
  'shell',
  'commit',
  'push',
  'network',
] as const satisfies readonly Right[]

/** A right that only makes sense with another one, as the catalog's `roleSchema` checks it. */
const REQUIRES: Partial<Record<Right, Right>> = {
  write: 'read',
  shell: 'run-checks',
  commit: 'run-checks',
  push: 'commit',
}

/** Limits the API checks, repeated so the form says them before the server does. */
export const ROLE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const ROLE_SLUG_MAX_LENGTH = 64
export const ROLE_NAME_MAX_LENGTH = 100
export const ROLE_DESCRIPTION_MAX_LENGTH = 600
export const ROLE_MISSION_MAX_LENGTH = 40_000
export const ROLE_LINE_MAX_LENGTH = 300
export const ROLE_LIST_MAX = 30
export const ROLES_MAX = 20
/** A folder from the repository root, as `packageFolders` writes them. */
export const ROLE_FOLDER = /^[A-Za-z0-9._@-]+(?:\/[A-Za-z0-9._@-]+)*$/

/**
 * The rights after one was ticked or unticked: ticking adds what it needs, unticking removes
 * what needed it, and `read` always stays. In the catalog's order.
 */
export function toggleRight(rights: readonly Right[], right: Right, on: boolean): Right[] {
  const picked = new Set<Right>(rights)
  if (on) {
    for (let next: Right | undefined = right; next; next = REQUIRES[next]) picked.add(next)
  } else if (right !== 'read') {
    const drop = (gone: Right) => {
      picked.delete(gone)
      for (const [other, needed] of Object.entries(REQUIRES) as [Right, Right][]) {
        if (needed === gone && picked.has(other)) drop(other)
      }
    }
    drop(right)
  }
  picked.add('read')
  return RIGHTS.filter((item) => picked.has(item))
}

/** A slug from a name: lower case, ASCII letters and digits, words joined by hyphens. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ROLE_SLUG_MAX_LENGTH)
    .replace(/-+$/, '')
}

/** Lines of a textarea, one item each: trimmed, blank ones dropped. */
export function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

/**
 * How a ready-made role ranks for a search (cmdk's `filter`): 0 hides it, 2 when every word is
 * in its name or identifier, 1 when the description is needed to find them all.
 */
export function presetRank(value: string, search: string, keywords: readonly string[] = []) {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 1
  const title = value.toLowerCase()
  if (words.every((word) => title.includes(word))) return 2
  const all = `${title} ${keywords.join(' ').toLowerCase()}`
  return words.every((word) => all.includes(word)) ? 1 : 0
}
