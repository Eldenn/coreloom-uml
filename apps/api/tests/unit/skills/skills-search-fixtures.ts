import type { SkillSearchQuery } from '@coreloom-uml/catalog'
import type { KnownSkill } from '#app/skills/services/skills-search'

export const SHA = 'a'.repeat(40)
export const NEW_SHA = 'b'.repeat(40)
export const FOLDER = 'c'.repeat(40)
export const NEW_FOLDER = 'd'.repeat(40)

export type Route = { status?: number; body: unknown }

/** A fake network: exact URLs, or URL prefixes ending with `*`. Anything else is a 404. */
export function fakeFetch(routes: Record<string, Route>) {
  const calls: { url: string; auth: string | null }[] = []
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, auth: new Headers(init?.headers).get('authorization') })
    const route =
      routes[url] ??
      Object.entries(routes).find(
        ([key]) => key.endsWith('*') && url.startsWith(key.slice(0, -1)),
      )?.[1]
    if (!route) return new Response('not found', { status: 404 })
    const body = typeof route.body === 'string' ? route.body : JSON.stringify(route.body)
    return new Response(body, { status: route.status ?? 200 })
  }) as typeof fetch
  return { fn, calls }
}

export const plan: SkillSearchQuery[] = [
  { query: 'playwright', topic: 'testing', affinity: { slot: 'testing.levels', values: ['e2e'] } },
  { query: 'c4 architecture', topic: 'architecture', affinity: { diagramKinds: ['c4'] } },
  { query: 'git', topic: 'tooling' },
]

export const skillMd = (name: string, description: string) =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`

/**
 * skills.sh returns four skills: `acme/skills/browser-tests` (two queries), `acme/skills/c4-docs`,
 * `tiny/skills/rare` (12 installs) and `risky/skills/danger` (a high audit). The `acme/skills`
 * repository is MIT and holds the first two.
 */
export function routes(overrides: Record<string, Route> = {}): Record<string, Route> {
  return {
    'https://skills.sh/api/search?q=playwright': {
      body: {
        skills: [
          {
            id: 'acme/skills/browser-tests',
            name: 'browser-tests',
            installs: 4000,
            source: 'acme/skills',
          },
          { id: 'tiny/skills/rare', name: 'rare', installs: 12, source: 'tiny/skills' },
          { id: 'risky/skills/danger', name: 'danger', installs: 9000, source: 'risky/skills' },
        ],
      },
    },
    'https://skills.sh/api/search?q=c4+architecture': {
      body: {
        skills: [
          { id: 'acme/skills/c4-docs', name: 'c4-docs', installs: 2500, source: 'acme/skills' },
          {
            id: 'acme/skills/browser-tests',
            name: 'browser-tests',
            installs: 4000,
            source: 'acme/skills',
          },
        ],
      },
    },
    'https://skills.sh/api/search?q=git': { body: { skills: [] } },
    'https://www.skills.sh/tele/audit?source=acme%2Fskills&skills=browser-tests': {
      body: { 'browser-tests': { snyk: { risk: 'low', analyzedAt: '2026-11-01' } } },
    },
    'https://www.skills.sh/tele/audit?source=acme%2Fskills&skills=c4-docs': {
      body: {
        'c4-docs': {
          socket: { risk: 'safe', alerts: 0, analyzedAt: '2026-11-02' },
          gen: { risk: 'safe', analyzedAt: '2026-11-02' },
        },
      },
    },
    'https://www.skills.sh/tele/audit?source=risky%2Fskills&skills=danger': {
      body: { danger: { snyk: { risk: 'high', analyzedAt: '2026-11-01' } } },
    },
    'https://api.github.com/repos/acme/skills': {
      body: { default_branch: 'main', license: { spdx_id: 'MIT' } },
    },
    'https://api.github.com/repos/acme/skills/commits/main': { body: { sha: SHA } },
    [`https://api.github.com/repos/acme/skills/git/trees/${SHA}?recursive=1`]: {
      body: {
        tree: [
          { path: 'skills', type: 'tree', sha: 'e'.repeat(40) },
          { path: 'skills/browser-tests', type: 'tree', sha: FOLDER },
          { path: 'skills/browser-tests/SKILL.md', type: 'blob', sha: 'f'.repeat(40) },
          { path: 'skills/c4-docs', type: 'tree', sha: NEW_FOLDER },
          { path: 'skills/c4-docs/SKILL.md', type: 'blob', sha: '1'.repeat(40) },
        ],
      },
    },
    [`https://raw.githubusercontent.com/acme/skills/${SHA}/skills/browser-tests/SKILL.md`]: {
      body: skillMd('browser-tests', 'Drive a browser with Playwright <b>safely</b>.'),
    },
    [`https://raw.githubusercontent.com/acme/skills/${SHA}/skills/c4-docs/SKILL.md`]: {
      body: skillMd('c4-docs', '"Document systems with C4 diagrams."'),
    },
    ...overrides,
  }
}

/** A skill the catalog holds already; a found one by default. */
export function known(overrides: Partial<KnownSkill> = {}): KnownSkill {
  return {
    slug: 'browser-tests',
    origin: 'search',
    blocked: false,
    registryId: 'acme/skills/browser-tests',
    name: 'browser-tests (acme)',
    description: { en: 'Drive a browser with Playwright bsafely/b.', fr: 'Piloter un navigateur.' },
    url: `https://github.com/acme/skills/tree/${NEW_SHA}/skills/browser-tests`,
    affinities: [{ slot: 'testing.levels', values: ['e2e'] }],
    topics: ['testing'],
    installs: 3000,
    audits: [{ provider: 'snyk', risk: 'low', analyzedAt: '2026-10-01' }],
    license: 'MIT',
    contentSha: FOLDER,
    eligible: true,
    ineligibleReason: null,
    ...overrides,
  }
}
