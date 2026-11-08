// The weekly search behind the skills catalog. Every skill the catalog's search plan finds on
// skills.sh is kept; one is eligible to be suggested when it has enough installs, security audits
// that pass, a GitHub repository with an open licence and a `SKILL.md`, which is then pinned to a
// commit. Pure apart from the `fetch` it is given, so tests run it against fixtures;
// `skills-catalog.ts` writes its result to the database.
import {
  ACCEPTED_AUDIT_RISKS,
  type AuditRisk,
  isSlotAffinity,
  type Skill,
  type SkillAffinity,
  SkillOrigin,
  type SkillSearchQuery,
} from '@coreloom-uml/catalog'

export const SKILLS_SH = 'https://skills.sh'
export const SKILLS_SH_AUDITS = 'https://www.skills.sh/tele/audit'
export const GITHUB_API = 'https://api.github.com'
export const GITHUB_RAW = 'https://raw.githubusercontent.com'

/** Licences a found skill's repository may have (SPDX ids). */
export const OPEN_LICENSES = [
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'MPL-2.0',
  '0BSD',
  'Unlicense',
  'CC0-1.0',
  'CC-BY-4.0',
] as const

export type SkillAudit = { provider: string; risk: AuditRisk; analyzedAt: string }

/** A skill the catalog already holds, as the search needs it. */
export type KnownSkill = {
  slug: string
  origin: SkillOrigin
  blocked: boolean
  registryId: string | null
  name: string
  description: Skill['description']
  url: string
  affinities: SkillAffinity[]
  topics: string[]
  installs: number | null
  audits: SkillAudit[]
  license: string | null
  contentSha: string | null
  eligible: boolean
  ineligibleReason: string | null
}

export type SearchOptions = {
  known: readonly KnownSkill[]
  plan: readonly SkillSearchQuery[]
  fetch: typeof fetch
  githubToken?: string
  /** Fewest installs a found skill needs to be suggested. */
  minInstalls: number
  /** The most skills checked on GitHub in this run, most installed first. */
  githubChecks: number
}

/**
 * What the run learnt about one skill. `seen`: a search returned it. `checked`: its repository
 * was read on GitHub in this run. For a manual or blocked skill only the registry figures count.
 */
export type SkillRecord = {
  slug: string
  isNew: boolean
  origin: SkillOrigin
  registryId: string
  source: string
  seen: boolean
  checked: boolean
  name: string
  description: Skill['description']
  url: string
  affinities: SkillAffinity[]
  topics: string[]
  installs: number
  audits: SkillAudit[]
  license: string | null
  contentSha: string | null
  eligible: boolean
  ineligibleReason: string | null
}

export type SearchReport = {
  found: number
  added: string[]
  checked: number
  eligible: number
  warnings: string[]
}

export type SearchResult = { records: SkillRecord[]; report: SearchReport }

type SearchHit = { id: string; name: string; installs: number; source: string }

type Candidate = {
  registryId: string
  source: string
  slug: string
  name: string
  installs: number
  affinities: SkillAffinity[]
  topics: string[]
  seen: boolean
  known?: KnownSkill
}

class SkipError extends Error {}

export async function searchSkills(options: SearchOptions): Promise<SearchResult> {
  const report: SearchReport = { found: 0, added: [], checked: 0, eligible: 0, warnings: [] }
  const http = new Http(options.fetch, options.githubToken)
  const github = new GithubReader(http)

  for (const skill of options.known.filter((item) => item.origin === SkillOrigin.Manual)) {
    const pin = parseGithubTreeUrl(skill.url)
    if (!pin) {
      report.warnings.push(`${skill.slug}: its URL is not a pinned GitHub folder, check it by hand`)
      continue
    }
    const status = await http.status(
      `${GITHUB_API}/repos/${pin.owner}/${pin.repo}/contents/${pin.path}/SKILL.md?ref=${pin.ref}`,
    )
    if (status !== 200)
      report.warnings.push(`${skill.slug}: SKILL.md not found at its pin (${status})`)
  }

  const candidates = await collectCandidates(options, http, report)
  const usedSlugs = new Set(options.known.map((skill) => skill.slug))
  const auditCache = new Map<string, Record<string, Record<string, unknown>> | null>()
  const records: SkillRecord[] = []
  let budget = options.githubChecks

  for (const candidate of candidates) {
    const known = candidate.known
    const slug = known?.slug ?? uniqueSlug(candidate.slug, candidate.source, usedSlugs)
    usedSlugs.add(slug)
    const record: SkillRecord = {
      slug,
      isNew: !known,
      origin: known?.origin ?? SkillOrigin.Search,
      registryId: candidate.registryId,
      source: candidate.source,
      seen: candidate.seen,
      checked: false,
      name: known?.name ?? cleanText(`${candidate.name} (${ownerOf(candidate.source)})`, 80),
      description: known?.description ?? { en: '' },
      url: known?.url ?? `${SKILLS_SH}/${candidate.registryId}`,
      affinities: candidate.affinities,
      topics: candidate.topics,
      installs: candidate.installs,
      audits: known?.audits ?? [],
      license: known?.license ?? null,
      contentSha: known?.contentSha ?? null,
      eligible: known?.eligible ?? false,
      ineligibleReason: known?.ineligibleReason ?? 'not checked yet',
    }
    records.push(record)
    if (!known) report.added.push(slug)

    if (record.origin === SkillOrigin.Manual || known?.blocked) {
      // Only the registry's figures: their entry and whether they are suggested stay as they are.
      record.audits = await auditsOf(http, auditCache, candidate).catch(() => record.audits)
      continue
    }
    if (candidate.installs < options.minInstalls) {
      ineligible(record, `fewer than ${options.minInstalls} installs`)
      continue
    }
    record.audits = await auditsOf(http, auditCache, candidate)
    if (record.audits.length === 0) {
      ineligible(record, 'no security audit yet')
      continue
    }
    const risky = record.audits.find((audit) => !ACCEPTED_AUDIT_RISKS.includes(audit.risk))
    if (risky) {
      ineligible(record, `audit ${risky.provider}: ${risky.risk}`)
      continue
    }
    if (budget <= 0) {
      // Checked again in a later run; a skill already pinned keeps its pin until then.
      if (!record.contentSha) ineligible(record, 'not checked on GitHub yet')
      continue
    }
    budget -= 1
    try {
      await checkOnGithub(record, candidate, github, http)
      record.checked = true
      record.eligible = true
      record.ineligibleReason = null
    } catch (error) {
      if (!(error instanceof SkipError)) throw error
      record.checked = true
      ineligible(record, error.message)
    }
  }

  report.found = records.filter((record) => record.seen).length
  report.checked = records.filter((record) => record.checked).length
  report.eligible = records.filter(
    (record) => record.origin === SkillOrigin.Search && record.eligible,
  ).length
  return { records, report }
}

function ineligible(record: SkillRecord, reason: string) {
  record.eligible = false
  record.ineligibleReason = reason.slice(0, 300)
}

function ownerOf(source: string): string {
  return source.split('/')[0] ?? source
}

/**
 * Every search result, merged by registry id, plus the eligible skills no search returned this
 * time (re-checked with their previous figures). Most installed first.
 */
async function collectCandidates(
  options: SearchOptions,
  http: Http,
  report: SearchReport,
): Promise<Candidate[]> {
  const knownByRegistryId = new Map<string, KnownSkill>()
  for (const skill of options.known) {
    if (skill.registryId) knownByRegistryId.set(skill.registryId, skill)
    else if (skill.origin === SkillOrigin.Manual) {
      // A manual skill is matched to its registry entry by its GitHub folder.
      const pin = parseGithubTreeUrl(skill.url)
      const folder = pin?.path.split('/').at(-1)
      if (pin && folder) knownByRegistryId.set(`${pin.owner}/${pin.repo}/${folder}`, skill)
    }
  }

  const byId = new Map<string, Candidate>()
  let failed = 0
  for (const item of options.plan) {
    let hits: SearchHit[]
    try {
      hits = await searchSkillsSh(http, item.query)
    } catch (error) {
      failed += 1
      report.warnings.push(`search "${item.query}" failed: ${(error as Error).message}`)
      continue
    }
    for (const hit of hits) {
      const candidate = byId.get(hit.id) ?? {
        registryId: hit.id,
        source: hit.source,
        slug: hit.id.split('/').at(-1) ?? hit.id,
        name: hit.name,
        installs: hit.installs,
        affinities: [],
        topics: [],
        seen: true,
        known: knownByRegistryId.get(hit.id),
      }
      if (item.affinity) candidate.affinities = mergeAffinities(candidate.affinities, item.affinity)
      if (!candidate.topics.includes(item.topic)) candidate.topics.push(item.topic)
      byId.set(hit.id, candidate)
    }
  }
  if (options.plan.length > 0 && failed === options.plan.length) {
    throw new Error('Every skills.sh search failed: nothing was changed')
  }
  for (const skill of options.known) {
    if (skill.origin !== SkillOrigin.Search || !skill.registryId || byId.has(skill.registryId))
      continue
    if (!skill.eligible || skill.blocked) continue
    const [owner, repo, ...rest] = skill.registryId.split('/')
    byId.set(skill.registryId, {
      registryId: skill.registryId,
      source: `${owner}/${repo}`,
      slug: rest.at(-1) ?? skill.slug,
      name: skill.name,
      installs: skill.installs ?? 0,
      affinities: [...skill.affinities],
      topics: [...skill.topics],
      seen: false,
      known: skill,
    })
  }
  return [...byId.values()].sort((a, b) => b.installs - a.installs)
}

/** A slot or diagram affinity is added once; values and kinds of the same one are merged. */
export function mergeAffinities(
  affinities: readonly SkillAffinity[],
  next: SkillAffinity,
): SkillAffinity[] {
  const merged = affinities.map((affinity) => structuredClone(affinity))
  if (isSlotAffinity(next)) {
    const same = merged.find((item) => isSlotAffinity(item) && item.slot === next.slot)
    if (!same) merged.push(structuredClone(next))
    else if (isSlotAffinity(same) && same.values && next.values) {
      same.values = [...new Set([...same.values, ...next.values])]
    }
    return merged
  }
  const diagrams = merged.find((item) => !isSlotAffinity(item))
  if (!diagrams) merged.push(structuredClone(next))
  else if (!isSlotAffinity(diagrams)) {
    diagrams.diagramKinds = [...new Set([...diagrams.diagramKinds, ...next.diagramKinds])]
  }
  return merged
}

type RepoSnapshot = {
  license: string
  commit: string
  entries: { path: string; type: string; sha: string }[]
}

/** Reads each repository once per run: many skills share one. */
class GithubReader {
  private readonly http: Http
  private readonly repos = new Map<string, Promise<RepoSnapshot>>()

  constructor(http: Http) {
    this.http = http
  }

  repo(owner: string, repo: string): Promise<RepoSnapshot> {
    const key = `${owner}/${repo}`
    let snapshot = this.repos.get(key)
    if (!snapshot) {
      snapshot = this.read(owner, repo)
      this.repos.set(key, snapshot)
    }
    return snapshot
  }

  private async read(owner: string, repo: string): Promise<RepoSnapshot> {
    const info = (await this.http.json(`${GITHUB_API}/repos/${owner}/${repo}`)) as {
      archived?: boolean
      default_branch?: string
      license?: { spdx_id?: string } | null
    }
    if (info.archived) throw new SkipError('archived repository')
    const license = info.license?.spdx_id ?? 'none'
    if (!(OPEN_LICENSES as readonly string[]).includes(license)) {
      throw new SkipError(`licence not accepted: ${license}`)
    }
    const branch = info.default_branch ?? 'main'
    const commit = (await this.http.json(
      `${GITHUB_API}/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`,
    )) as { sha?: string }
    if (!commit.sha) throw new SkipError('no commit on the default branch')
    const tree = (await this.http.json(
      `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${commit.sha}?recursive=1`,
    )) as { tree?: { path: string; type: string; sha: string }[] }
    return { license, commit: commit.sha, entries: tree.tree ?? [] }
  }
}

/** Pins the skill to its repository's latest commit, unless its folder did not change. */
async function checkOnGithub(
  record: SkillRecord,
  candidate: Candidate,
  github: GithubReader,
  http: Http,
) {
  const match = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(candidate.source)
  if (!match) throw new SkipError(`not a GitHub repository: ${candidate.source}`)
  const [, owner, repo] = match as unknown as [string, string, string]

  const snapshot = await github.repo(owner, repo)
  record.license = snapshot.license
  const skillFile = snapshot.entries.find(
    (entry) =>
      entry.type === 'blob' &&
      (entry.path === `${candidate.slug}/SKILL.md` ||
        entry.path.endsWith(`/${candidate.slug}/SKILL.md`)),
  )
  if (!skillFile) throw new SkipError(`no ${candidate.slug}/SKILL.md in the repository`)
  const folder = skillFile.path.slice(0, -'/SKILL.md'.length)
  const folderSha = snapshot.entries.find(
    (entry) => entry.type === 'tree' && entry.path === folder,
  )?.sha
  if (!folderSha) throw new SkipError('cannot read the skill folder')
  if (record.contentSha === folderSha && record.description.en !== '') return

  const markdown = await http.text(
    `${GITHUB_RAW}/${owner}/${repo}/${snapshot.commit}/${skillFile.path}`,
  )
  const frontmatter = readFrontmatter(markdown)
  const description = cleanText(frontmatter.description ?? '', 300)
  if (!description) throw new SkipError('SKILL.md has no description')
  record.name = cleanText(`${frontmatter.name ?? candidate.slug} (${owner})`, 80)
  record.description =
    record.description.en === description ? record.description : { en: description }
  record.url = `https://github.com/${owner}/${repo}/tree/${snapshot.commit}/${folder}`
  record.contentSha = folderSha
}

async function auditsOf(
  http: Http,
  cache: Map<string, Record<string, Record<string, unknown>> | null>,
  candidate: Candidate,
): Promise<SkillAudit[]> {
  const key = `${candidate.source}#${candidate.slug}`
  if (!cache.has(key)) {
    const query = new URLSearchParams({ source: candidate.source, skills: candidate.slug })
    try {
      const body = (await http.json(`${SKILLS_SH_AUDITS}?${query}`)) as Record<
        string,
        Record<string, unknown>
      >
      cache.set(key, body)
    } catch (error) {
      // Not audited yet. Any other failure stops the run: an outage must never remove a skill.
      if (!(error instanceof SkipError)) throw error
      cache.set(key, null)
    }
  }
  const partners = (cache.get(key)?.[candidate.slug] ?? {}) as Record<
    string,
    { risk?: string; analyzedAt?: string }
  >
  return Object.entries(partners)
    .filter(([, audit]) => typeof audit?.risk === 'string')
    .map(([provider, audit]) => ({
      provider,
      risk: (KNOWN_RISKS.has(audit.risk as AuditRisk) ? audit.risk : 'unknown') as AuditRisk,
      analyzedAt: String(audit.analyzedAt ?? ''),
    }))
    .filter((audit) => audit.analyzedAt !== '')
    .sort((a, b) => a.provider.localeCompare(b.provider))
}

const KNOWN_RISKS = new Set<AuditRisk>(['safe', 'low', 'medium', 'high', 'critical', 'unknown'])

async function searchSkillsSh(http: Http, query: string): Promise<SearchHit[]> {
  const body = (await http.json(
    `${SKILLS_SH}/api/search?${new URLSearchParams({ q: query })}`,
  )) as {
    skills?: unknown
  }
  if (!Array.isArray(body.skills)) throw new Error('unexpected search response')
  return body.skills.flatMap((item) => {
    const hit = item as Partial<SearchHit>
    return typeof hit.id === 'string' &&
      typeof hit.source === 'string' &&
      typeof hit.installs === 'number'
      ? [
          {
            id: hit.id,
            name: String(hit.name ?? hit.id),
            installs: hit.installs,
            source: hit.source,
          },
        ]
      : []
  })
}

/** `https://github.com/<owner>/<repo>/tree/<ref>/<path>`, or `null`. */
export function parseGithubTreeUrl(url: string) {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)$/.exec(url)
  if (!match) return null
  const [, owner, repo, ref, path] = match as unknown as [string, string, string, string, string]
  return { owner, repo, ref, path }
}

/** The `name` and `description` of a `SKILL.md` frontmatter (plain or quoted, one line or folded). */
export function readFrontmatter(markdown: string): { name?: string; description?: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)
  if (!match?.[1]) return {}
  const fields: Record<string, string> = {}
  let current: string | null = null
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([A-Za-z_-]+):\s*(.*)$/.exec(line)
    if (field?.[1]) {
      current = field[1]
      fields[current] = (field[2] ?? '').replace(/^[>|]-?$/, '')
    } else if (current && /^\s+\S/.test(line)) {
      fields[current] = `${fields[current]} ${line.trim()}`.trim()
    } else {
      current = null
    }
  }
  const unquote = (value?: string) => value?.trim().replace(/^(['"])([\s\S]*)\1$/, '$2')
  return { name: unquote(fields.name), description: unquote(fields.description) }
}

/** One line, no HTML or managed-block marker, cut to `max` characters. */
export function cleanText(value: string, max: number): string {
  const text = value
    .replace(/\p{Cc}/gu, ' ')
    .replace(/[<>]/g, '')
    .replaceAll('coreloom-uml:', '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

function uniqueSlug(slug: string, source: string, used: Set<string>): string {
  const owner = ownerOf(source)
  const kebab = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
  const base = kebab(slug) || 'skill'
  if (!used.has(base)) return base
  const owned = `${base}-${kebab(owner)}`
  let id = owned
  for (let n = 2; used.has(id); n++) id = `${owned}-${n}`
  return id
}

class Http {
  private readonly fetchFn: typeof fetch
  private readonly githubToken: string | undefined

  constructor(fetchFn: typeof fetch, githubToken?: string) {
    this.fetchFn = fetchFn
    this.githubToken = githubToken
  }

  private headers(url: string): Record<string, string> {
    const headers: Record<string, string> = { 'user-agent': 'coreloom-uml-skills-refresh' }
    if (url.startsWith(GITHUB_API)) {
      headers.accept = 'application/vnd.github+json'
      if (this.githubToken) headers.authorization = `Bearer ${this.githubToken}`
    }
    return headers
  }

  async status(url: string): Promise<number> {
    const response = await this.fetchFn(url, { headers: this.headers(url), redirect: 'manual' })
    return response.status
  }

  async json(url: string): Promise<unknown> {
    const response = await this.fetchFn(url, { headers: this.headers(url), redirect: 'manual' })
    if (response.status === 404) throw new SkipError(`not found: ${new URL(url).pathname}`)
    if (!response.ok) throw new Error(`${response.status} from ${new URL(url).host}`)
    return response.json()
  }

  async text(url: string): Promise<string> {
    const response = await this.fetchFn(url, { headers: this.headers(url), redirect: 'manual' })
    if (!response.ok)
      throw new SkipError(`cannot read ${new URL(url).pathname} (${response.status})`)
    return response.text()
  }
}

/** The report as one log line. */
export function renderReport(report: SearchReport): string {
  return [
    `${report.found} skills found`,
    `${report.added.length} new`,
    `${report.checked} checked on GitHub`,
    `${report.eligible} eligible`,
    ...report.warnings,
  ].join('; ')
}
