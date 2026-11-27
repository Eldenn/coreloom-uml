// The weekly search behind the skills catalog. Every skill a source lists is kept: skills.sh,
// searched with the catalog's plan; Smithery's top verified skills; and the GitHub repositories
// the admin trusts, listed whole or as their `marketplace.json` says (plugins of other
// repositories included). One is eligible to be suggested when it has enough installs and
// security audits that pass (a skill a trusting source lists needs neither, but a bad audit
// still counts), a GitHub repository with an open licence and a `SKILL.md`, which is then pinned
// to a commit. Pure apart from the `fetch` it is given, so tests run it against fixtures;
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
import {
  SKILL_SOURCE_LIMITS,
  SkillSourceKind,
  SMITHERY_GATE,
  TRUSTING_SOURCE_KINDS,
} from '#app/skills/constants/skill'

export const SKILLS_SH = 'https://skills.sh'
export const SMITHERY_API = 'https://api.smithery.ai'
/** Where a repository lists its plugins (Claude Code's plugin marketplace format). */
export const MARKETPLACE_FILE = '.claude-plugin/marketplace.json'
export const SKILLS_SH_AUDITS = 'https://www.skills.sh/tele/audit'
/** A skill's page (`<SKILLS_SH_PAGES>/<registry id>`); `skills.sh` redirects there. */
export const SKILLS_SH_PAGES = 'https://www.skills.sh'
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
  /** The enabled trusting sources (GitHub, Smithery) that listed it at their last run that answered. */
  trustedBy: number[]
}

/** An enabled row of `skill_sources`, as the search reads it. */
export type SearchSource = {
  id: number
  kind: SkillSourceKind
  owner: string | null
  repo: string | null
  path: string | null
}

/**
 * How one source answered. `ok`: it answered (a repository that is archived or not openly
 * licensed answers, with nothing listed and `error` saying why). `complete`: every query of it
 * answered, so what it listed may replace what it listed before.
 */
export type SourceOutcome = {
  sourceId: number
  ok: boolean
  complete: boolean
  error: string | null
}

export type SearchOptions = {
  known: readonly KnownSkill[]
  plan: readonly SkillSearchQuery[]
  /** The enabled sources; without a skills.sh one, nothing is asked of skills.sh at all. */
  sources: readonly SearchSource[]
  fetch: typeof fetch
  githubToken?: string
  /** Fewest installs a found skill needs to be suggested. */
  minInstalls: number
  /** The most skills checked on GitHub in this run, most installed first. */
  githubChecks: number
  /**
   * One skill's sync (`syncSkill`): every known skill with a registry entry is checked again,
   * whether or not it was eligible, with the figures it has.
   */
  recheck?: boolean
  /** The most skills without a description whose skills.sh page is read in this run. */
  pageDescriptions?: number
  /** Told what the run is doing, step by step (the command prints it). */
  onProgress?: (message: string) => void
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
  /** The sources that listed it this run. */
  foundBy: number[]
  /** A trusting source (GitHub, Smithery) lists it: no installs or audit needed. */
  trusted: boolean
}

export type SearchReport = {
  found: number
  added: string[]
  checked: number
  eligible: number
  /** The skills whose files were copied for review this run (`skill-versions.ts`). */
  copied: string[]
  warnings: string[]
}

export type SearchResult = {
  records: SkillRecord[]
  report: SearchReport
  sources: SourceOutcome[]
}

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
  foundBy: number[]
  /** Its folder, when a GitHub source listed it. */
  folder?: string
  trusted?: boolean
}

/** A skill that cannot be used as it is: recorded with a reason, the run goes on. */
export class SkipError extends Error {}

export async function searchSkills(options: SearchOptions): Promise<SearchResult> {
  const report: SearchReport = {
    found: 0,
    added: [],
    checked: 0,
    eligible: 0,
    copied: [],
    warnings: [],
  }
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

  // A trusted repository that did not answer (a source, or a plugin a marketplace lists): its
  // skills keep their pin until it does.
  const unreachable = new Set<string>()
  const { candidates, outcomes } = await collectCandidates(
    options,
    http,
    github,
    report,
    unreachable,
  )
  const kindOf = new Map(options.sources.map((source) => [source.id, source]))
  // skills.sh is asked for audits only when it answered this run: down, its skills stay frozen.
  const skillsSh = outcomes.some(
    (outcome) => outcome.ok && kindOf.get(outcome.sourceId)?.kind === SkillSourceKind.SkillsSh,
  )
  for (const outcome of outcomes) {
    const source = kindOf.get(outcome.sourceId)
    if (!outcome.ok && source?.kind === SkillSourceKind.Github) {
      unreachable.add(`${source.owner}/${source.repo}`.toLowerCase())
    }
  }
  options.onProgress?.(`${candidates.length} candidates, checking audits and GitHub`)
  const usedSlugs = new Set(options.known.map((skill) => skill.slug))
  const auditCache = new Map<string, Record<string, Record<string, unknown>> | null>()
  const records: SkillRecord[] = []
  let budget = options.githubChecks
  let pages = options.pageDescriptions ?? 0

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
      foundBy: candidate.foundBy,
      trusted: candidate.trusted ?? false,
    }
    records.push(record)
    if (!known) report.added.push(slug)
    if (skillsSh && record.description.en === '' && pages > 0) {
      // Not read on GitHub yet: its skills.sh page says what it is about, for the tagger to tag it.
      pages -= 1
      const description = await pageDescription(http, candidate.registryId).catch(() => '')
      if (description) record.description = { en: description }
    }

    if (record.origin === SkillOrigin.Manual || known?.blocked) {
      // Only the registry's figures: their entry and whether they are suggested stay as they are.
      if (skillsSh) {
        record.audits = await auditsOf(http, auditCache, candidate).catch(() => record.audits)
      }
      continue
    }
    if (!record.trusted && candidate.installs < options.minInstalls) {
      ineligible(record, `fewer than ${options.minInstalls} installs`)
      continue
    }
    // Without skills.sh, a skill keeps the audits it had (frozen); a trusted one whose audits
    // cannot be read keeps them too, since its source answered.
    if (skillsSh) {
      try {
        record.audits = await auditsOf(http, auditCache, candidate)
      } catch (error) {
        if (!record.trusted) throw error
        report.warnings.push(
          `${record.slug}: audits not read (${(error as Error).message}), the last ones kept`,
        )
      }
    }
    if (!record.trusted && record.audits.length === 0) {
      ineligible(record, 'no security audit yet')
      continue
    }
    const risky = record.audits.find((audit) => !ACCEPTED_AUDIT_RISKS.includes(audit.risk))
    if (risky) {
      ineligible(record, `audit ${risky.provider}: ${risky.risk}`)
      continue
    }
    if (budget <= 0 || unreachable.has(candidate.source.toLowerCase())) {
      // Checked again in a later run; a skill already pinned keeps its pin until then.
      if (!record.contentSha) ineligible(record, 'not checked on GitHub yet')
      continue
    }
    budget -= 1
    options.onProgress?.(
      `GitHub check ${options.githubChecks - budget}/${options.githubChecks}: ${record.registryId}`,
    )
    try {
      await checkOnGithub(record, candidate, github, http)
      record.checked = true
      record.eligible = true
      record.ineligibleReason = null
    } catch (error) {
      if (!(error instanceof SkipError)) {
        // An untrusted skill still stops the run: a GitHub outage must never unlist it. A
        // trusted one comes from a list of other publishers' repositories (Smithery, a
        // marketplace): one that GitHub refuses must not stop every run.
        if (!record.trusted) throw error
        report.warnings.push(`${record.slug}: not checked on GitHub (${(error as Error).message})`)
        if (!record.contentSha) ineligible(record, 'not checked on GitHub yet')
        continue
      }
      record.checked = true
      ineligible(record, error.message)
    }
  }

  report.found = records.filter((record) => record.seen).length
  report.checked = records.filter((record) => record.checked).length
  report.eligible = records.filter(
    (record) => record.origin === SkillOrigin.Search && record.eligible,
  ).length
  return { records, report, sources: outcomes }
}

/**
 * The description a skill's skills.sh page gives in its `<meta name="description">` (from its
 * SKILL.md, cut by skills.sh), or `''`. Text only: entities decoded, cut like any description.
 */
export async function pageDescription(http: Http, registryId: string): Promise<string> {
  const path = registryId.split('/').map(encodeURIComponent).join('/')
  const html = await http.text(`${SKILLS_SH_PAGES}/${path}`)
  const content = /<meta\s+name="description"\s+content="([^"]*)"/i.exec(html)?.[1] ?? ''
  return cleanText(decodeEntities(content), 300)
}

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (/^#x/i.test(code)) return String.fromCodePoint(Number.parseInt(code.slice(2), 16))
    if (code.startsWith('#')) return String.fromCodePoint(Number.parseInt(code.slice(1), 10))
    return ENTITIES[code.toLowerCase()] ?? entity
  })
}

function ineligible(record: SkillRecord, reason: string) {
  record.eligible = false
  record.ineligibleReason = reason.slice(0, 300)
}

function ownerOf(source: string): string {
  return source.split('/')[0] ?? source
}

/**
 * What every source listed, merged by registry id, plus the eligible skills none listed this
 * time (re-checked with their previous figures). Trusted first, then most installed. Throws when
 * every source failed: nothing may change then.
 */
async function collectCandidates(
  options: SearchOptions,
  http: Http,
  github: GithubReader,
  report: SearchReport,
  unreachable: Set<string>,
): Promise<{ candidates: Candidate[]; outcomes: SourceOutcome[] }> {
  // Keyed in lower case: GitHub names are case-insensitive, and sources do not agree on case.
  const knownByRegistryId = new Map<string, KnownSkill>()
  for (const skill of options.known) {
    if (skill.registryId) knownByRegistryId.set(skill.registryId.toLowerCase(), skill)
    else if (skill.origin === SkillOrigin.Manual) {
      // A manual skill is matched to its registry entry by its GitHub folder.
      const pin = parseGithubTreeUrl(skill.url)
      const folder = pin?.path.split('/').at(-1)
      if (pin && folder) {
        knownByRegistryId.set(`${pin.owner}/${pin.repo}/${folder}`.toLowerCase(), skill)
      }
    }
  }

  const byId = new Map<string, Candidate>()
  const outcomes: SourceOutcome[] = []
  for (const source of options.sources) {
    if (source.kind === SkillSourceKind.SkillsSh) {
      outcomes.push(await searchSkillsSh(options, http, report, source, byId, knownByRegistryId))
      continue
    }
    if (options.recheck) continue
    const listing: Listing = { source, byId, knownByRegistryId, report, kept: new Set() }
    outcomes.push(
      source.kind === SkillSourceKind.Smithery
        ? await listSmithery(http, listing)
        : await listRepository(github, http, listing, unreachable),
    )
  }
  if (outcomes.length > 0 && outcomes.every((outcome) => !outcome.ok)) {
    throw new Error('Every source failed: nothing was changed')
  }
  for (const skill of options.known) {
    if (!skill.registryId || byId.has(skill.registryId.toLowerCase())) continue
    if (!options.recheck) {
      if (skill.origin !== SkillOrigin.Search || !skill.eligible || skill.blocked) continue
    }
    const [owner, repo, ...rest] = skill.registryId.split('/')
    byId.set(skill.registryId.toLowerCase(), {
      registryId: skill.registryId,
      source: `${owner}/${repo}`,
      slug: rest.at(-1) ?? skill.slug,
      name: skill.name,
      installs: skill.installs ?? 0,
      affinities: [...skill.affinities],
      topics: [...skill.topics],
      seen: false,
      known: skill,
      foundBy: [],
    })
  }
  const trusting = new Set(
    options.sources
      .filter((source) => (TRUSTING_SOURCE_KINDS as readonly string[]).includes(source.kind))
      .map((source) => source.id),
  )
  const whole = new Set(
    outcomes.filter((outcome) => outcome.ok && outcome.complete).map((item) => item.sourceId),
  )
  for (const candidate of byId.values()) {
    // A source that did not answer whole this run still vouches for what it listed before.
    candidate.trusted =
      candidate.foundBy.some((id) => trusting.has(id)) ||
      (candidate.known?.trustedBy ?? []).some((id) => trusting.has(id) && !whole.has(id))
  }
  const candidates = [...byId.values()].sort(
    (a, b) => Number(b.trusted) - Number(a.trusted) || b.installs - a.installs,
  )
  return { candidates, outcomes }
}

/** The plan's queries on skills.sh; it failed only when every query failed. */
async function searchSkillsSh(
  options: SearchOptions,
  http: Http,
  report: SearchReport,
  source: SearchSource,
  byId: Map<string, Candidate>,
  knownByRegistryId: Map<string, KnownSkill>,
): Promise<SourceOutcome> {
  let failed = 0
  for (const [index, item] of options.plan.entries()) {
    options.onProgress?.(`search ${index + 1}/${options.plan.length}: "${item.query}"`)
    let hits: SearchHit[]
    try {
      hits = await querySkillsSh(http, item.query)
    } catch (error) {
      failed += 1
      report.warnings.push(`search "${item.query}" failed: ${(error as Error).message}`)
      continue
    }
    for (const hit of hits) {
      const key = hit.id.toLowerCase()
      const candidate = byId.get(key) ?? {
        registryId: hit.id,
        source: hit.source,
        slug: hit.id.split('/').at(-1) ?? hit.id,
        name: hit.name,
        installs: hit.installs,
        affinities: [],
        topics: [],
        seen: true,
        known: knownByRegistryId.get(key),
        foundBy: [],
      }
      if (item.affinity) candidate.affinities = mergeAffinities(candidate.affinities, item.affinity)
      if (!candidate.topics.includes(item.topic)) candidate.topics.push(item.topic)
      if (!candidate.foundBy.includes(source.id)) candidate.foundBy.push(source.id)
      byId.set(key, candidate)
    }
  }
  const all = options.plan.length > 0 && failed === options.plan.length
  return {
    sourceId: source.id,
    ok: !all,
    complete: failed === 0,
    error: all ? 'every search failed' : failed > 0 ? `${failed} searches failed` : null,
  }
}

/** What one listing source (a repository, Smithery) has listed so far this run. */
type Listing = {
  source: SearchSource
  byId: Map<string, Candidate>
  knownByRegistryId: Map<string, KnownSkill>
  report: SearchReport
  /** Lower-case registry ids listed, at most `SKILL_SOURCE_LIMITS.skillsPerSource`. */
  kept: Set<string>
  full?: boolean
}

/** Lists one `SKILL.md` folder of `repository`; false once the source holds all it may. */
function listFolder(listing: Listing, repository: string, folder: string): boolean {
  const max = SKILL_SOURCE_LIMITS.skillsPerSource
  const slug = folder.split('/').at(-1) as string
  const registryId = `${repository}/${slug}`
  const key = registryId.toLowerCase()
  if (listing.kept.has(key)) {
    listing.report.warnings.push(`${repository}: two folders named ${slug}, ${folder} left out`)
    return true
  }
  if (listing.kept.size >= max) {
    if (!listing.full) {
      listing.report.warnings.push(
        `${sourceName(listing.source)}: more than ${max} skills, the first ${max} kept`,
      )
    }
    listing.full = true
    return false
  }
  listing.kept.add(key)
  const id = listing.source.id
  const found = listing.byId.get(key)
  if (found) {
    if (!found.foundBy.includes(id)) found.foundBy.push(id)
    found.folder = folder
    return true
  }
  const known = listing.knownByRegistryId.get(key)
  listing.byId.set(key, {
    registryId,
    source: repository,
    slug,
    name: slug,
    installs: known?.installs ?? 0,
    affinities: [...(known?.affinities ?? [])],
    topics: [...(known?.topics ?? [])],
    seen: true,
    known,
    foundBy: [id],
    folder,
  })
  return true
}

function sourceName(source: SearchSource): string {
  return source.kind === SkillSourceKind.Smithery ? 'smithery.ai' : `${source.owner}/${source.repo}`
}

/**
 * Every `SKILL.md` folder of a trusted repository under its `path`, in path order, or, at its root
 * with a `marketplace.json`, the skills of the plugins it lists. At most
 * `SKILL_SOURCE_LIMITS.skillsPerSource`. A repository that is archived or not openly licensed
 * answers with nothing listed; any other failure is the source failing.
 */
async function listRepository(
  github: GithubReader,
  http: Http,
  listing: Listing,
  unreachable: Set<string>,
): Promise<SourceOutcome> {
  const { source, report } = listing
  let snapshot: RepoSnapshot
  let complete = true
  try {
    snapshot = await github.repo(source.owner ?? '', source.repo ?? '')
    const hasMarketplace = snapshot.entries.some(
      (entry) => entry.type === 'blob' && entry.path === MARKETPLACE_FILE,
    )
    if (!source.path && hasMarketplace) {
      complete = await listMarketplace(github, http, listing, snapshot, unreachable)
      const error = complete ? null : 'some listed repositories were not read'
      return { sourceId: source.id, ok: true, complete, error }
    }
  } catch (error) {
    const message = (error as Error).message
    report.warnings.push(`source ${source.owner}/${source.repo}: ${message}`)
    return { sourceId: source.id, ok: error instanceof SkipError, complete: true, error: message }
  }
  // Ids use the repository's own name, as skills.sh does: `ACME/Skills` is `acme/skills`.
  for (const folder of skillFolders(snapshot.entries, [source.path ?? ''], true)) {
    if (!listFolder(listing, snapshot.fullName, folder)) break
  }
  return { sourceId: source.id, ok: true, complete: true, error: null }
}

/**
 * The `SKILL.md` folders under `roots`, in path order: at any depth with `deep`, else a root that
 * is a skill itself or holds skills one level down (how a plugin's `skills` are laid out).
 */
function skillFolders(entries: RepoSnapshot['entries'], roots: string[], deep = false): string[] {
  const folders = new Set<string>()
  for (const entry of entries) {
    if (entry.type !== 'blob' || !entry.path.endsWith('/SKILL.md')) continue
    const folder = entry.path.slice(0, -'/SKILL.md'.length)
    const parent = folder.includes('/') ? folder.slice(0, folder.lastIndexOf('/')) : ''
    const listed = roots.some((root) =>
      deep
        ? root === '' || folder === root || folder.startsWith(`${root}/`)
        : folder === root || parent === root,
    )
    if (listed) folders.add(folder)
  }
  return [...folders].sort()
}

/** `a/./b/` as `a/b`; null when it leaves its root (`..`). */
function joinPath(...parts: string[]): string | null {
  const segments = parts
    .join('/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
  return segments.includes('..') ? null : segments.join('/')
}

type MarketplacePlugin = { name?: unknown; source?: unknown; skills?: unknown }

/**
 * Lists the skills of the plugins a trusted marketplace lists: a plugin of the repository itself,
 * or of another GitHub repository (at most `SKILL_SOURCE_LIMITS.marketplaceRepos`), whose
 * publisher the marketplace vouches for. A plugin's skills are its `skills` entries, else its
 * `skills/` folder. Answers whether every listed repository could be read.
 */
async function listMarketplace(
  github: GithubReader,
  http: Http,
  listing: Listing,
  snapshot: RepoSnapshot,
  unreachable: Set<string>,
): Promise<boolean> {
  const { report } = listing
  const label = snapshot.fullName
  const body = (await http.json(
    `${GITHUB_RAW}/${snapshot.fullName}/${snapshot.commit}/${MARKETPLACE_FILE}`,
  )) as { plugins?: unknown; metadata?: { pluginRoot?: unknown } }
  const plugins = (Array.isArray(body.plugins) ? body.plugins : []) as MarketplacePlugin[]
  const pluginRoot = typeof body.metadata?.pluginRoot === 'string' ? body.metadata.pluginRoot : ''
  let complete = true
  const elsewhere = new Set<string>()
  let skipped = 0
  for (const plugin of plugins) {
    const where = pluginLocation(plugin.source, pluginRoot, snapshot.fullName)
    if (!where) {
      skipped += 1
      continue
    }
    let tree = snapshot
    if (where.repository) {
      // Repositories, not plugins: a monorepo of many plugins counts once.
      const key = where.repository.toLowerCase()
      if (!elsewhere.has(key) && elsewhere.size >= SKILL_SOURCE_LIMITS.marketplaceRepos) {
        report.warnings.push(
          `${label}: more than ${SKILL_SOURCE_LIMITS.marketplaceRepos} other repositories, the rest left out`,
        )
        complete = false
        break
      }
      elsewhere.add(key)
      const [owner, repo] = where.repository.split('/') as [string, string]
      try {
        tree = await github.repo(owner, repo)
      } catch (error) {
        report.warnings.push(`${label}: plugin ${String(plugin.name)}: ${(error as Error).message}`)
        if (!(error instanceof SkipError)) {
          complete = false
          unreachable.add(where.repository.toLowerCase())
        }
        continue
      }
    }
    const entries = Array.isArray(plugin.skills)
      ? plugin.skills
      : typeof plugin.skills === 'string'
        ? [plugin.skills]
        : ['skills']
    const roots = entries.flatMap((entry) => {
      const root = typeof entry === 'string' ? joinPath(where.dir, entry) : null
      return root === null ? [] : [root]
    })
    for (const folder of skillFolders(tree.entries, roots)) {
      if (!listFolder(listing, tree.fullName, folder)) return complete
    }
  }
  if (skipped > 0) report.warnings.push(`${label}: ${skipped} plugins not on GitHub left out`)
  return complete
}

/**
 * Where a plugin entry's `source` is: a folder of the marketplace's repository (`repository`
 * null), or of another GitHub repository. Null for any other kind (npm, an archive, a command).
 */
function pluginLocation(
  source: unknown,
  pluginRoot: string,
  marketplace: string,
): { repository: string | null; dir: string } | null {
  const local = (dir: string | null) => (dir === null ? null : { repository: null, dir })
  if (typeof source === 'string') {
    if (source === '.' || source.startsWith('./')) return local(joinPath(source))
    return pluginRoot && !source.includes('/') ? local(joinPath(pluginRoot, source)) : null
  }
  if (!source || typeof source !== 'object') return null
  const { source: kind, repo, url, path } = source as Record<string, unknown>
  const address = kind === 'github' ? repo : kind === 'url' || kind === 'git-subdir' ? url : null
  const match =
    typeof address === 'string'
      ? /^(?:https:\/\/github\.com\/)?([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(
          address,
        )
      : null
  if (!match) return null
  const repository = `${match[1]}/${match[2]}`
  const dir = kind === 'git-subdir' ? joinPath(typeof path === 'string' ? path : '') : ''
  if (dir === null) return null
  return {
    repository: repository.toLowerCase() === marketplace.toLowerCase() ? null : repository,
    dir,
  }
}

/**
 * Smithery's top skills, in its own order (at most `SKILL_SOURCE_LIMITS.smitheryPages` pages):
 * only those of a verified publisher scoring at least `SMITHERY_GATE.minQualityScore`, in a
 * GitHub folder. Its search cannot be relied on, so it is listed, not searched.
 */
async function listSmithery(http: Http, listing: Listing): Promise<SourceOutcome> {
  const sourceId = listing.source.id
  for (let page = 1; page <= SKILL_SOURCE_LIMITS.smitheryPages; page++) {
    let body: { skills?: unknown; pagination?: { totalPages?: unknown } }
    try {
      body = (await http.json(`${SMITHERY_API}/skills?pageSize=100&page=${page}`)) as typeof body
      if (!Array.isArray(body.skills)) throw new Error('unexpected response')
    } catch (error) {
      const message = (error as Error).message
      listing.report.warnings.push(`source smithery.ai, page ${page}: ${message}`)
      return page === 1
        ? { sourceId, ok: false, complete: true, error: message }
        : { sourceId, ok: true, complete: false, error: `page ${page} failed` }
    }
    const skills = body.skills as Record<string, unknown>[]
    for (const skill of skills) {
      const score = skill.qualityScore
      if (skill.verified !== true) continue
      if (typeof score !== 'number' || score < SMITHERY_GATE.minQualityScore) continue
      const pin = parseGithubTreeUrl(typeof skill.gitUrl === 'string' ? skill.gitUrl : '')
      const folder = pin ? joinPath(pin.path) : null
      if (!pin || !folder) continue
      if (!listFolder(listing, `${pin.owner}/${pin.repo}`, folder)) {
        return { sourceId, ok: true, complete: true, error: null }
      }
    }
    const pages = body.pagination?.totalPages
    if (skills.length === 0 || (typeof pages === 'number' && page >= pages)) break
  }
  return { sourceId, ok: true, complete: true, error: null }
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
    else if (isSlotAffinity(same)) {
      same.values = [...new Set([...same.values, ...next.values])]
      // A rule one query fits is never one the skill goes against.
      const against = [...new Set([...(same.against ?? []), ...(next.against ?? [])])].filter(
        (rule) => !same.values.includes(rule),
      )
      if (against.length > 0) same.against = against
      else delete same.against
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
  /** The repository's own `owner/repo`, whatever case it was asked in. */
  fullName: string
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
      full_name?: string
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
    const fullName = info.full_name ?? `${owner}/${repo}`
    return { license, commit: commit.sha, entries: tree.tree ?? [], fullName }
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
      (candidate.folder
        ? entry.path === `${candidate.folder}/SKILL.md`
        : entry.path === `${candidate.slug}/SKILL.md` ||
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

async function querySkillsSh(http: Http, query: string): Promise<SearchHit[]> {
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

/** A request that takes longer fails instead of blocking the whole run. */
const REQUEST_TIMEOUT_MS = 30_000

export class Http {
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
    const response = await this.fetchFn(url, {
      headers: this.headers(url),
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    return response.status
  }

  async json(url: string): Promise<unknown> {
    const response = await this.fetchFn(url, {
      headers: this.headers(url),
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (response.status === 404) throw new SkipError(`not found: ${new URL(url).pathname}`)
    // A renamed or moved repository: its registry entry is out of date, not GitHub down. Only
    // GitHub's API: elsewhere (skills.sh's audits) a redirect is a failure, never "not found".
    if (url.startsWith(GITHUB_API) && response.status >= 300 && response.status < 400) {
      throw new SkipError(`moved: ${new URL(url).pathname}`)
    }
    if (!response.ok) throw new Error(`${response.status} from ${new URL(url).host}`)
    return response.json()
  }

  /** A file's bytes, refused past `maxBytes` (read whole: a raw GitHub file sends its length). */
  async bytes(url: string, maxBytes: number): Promise<Uint8Array> {
    const response = await this.fetchFn(url, {
      headers: this.headers(url),
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok)
      throw new SkipError(`cannot read ${new URL(url).pathname} (${response.status})`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length > maxBytes) throw new SkipError(`${new URL(url).pathname} is too large`)
    return bytes
  }

  async text(url: string): Promise<string> {
    const response = await this.fetchFn(url, {
      headers: this.headers(url),
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
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
    `${report.copied.length} copied for review`,
    ...report.warnings,
  ].join('; ')
}
