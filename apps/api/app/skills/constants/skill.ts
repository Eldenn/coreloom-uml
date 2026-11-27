/**
 * Whether a catalog skill may be used at all. `blocked`: an operator took it out
 * (`node ace skills:block`); the search keeps cataloguing it but never suggests it again.
 * Whether an active skill is suggested is `eligible`, set by the search.
 */
export const SkillStatus = {
  Active: 'active',
  Blocked: 'blocked',
} as const

export type SkillStatus = (typeof SkillStatus)[keyof typeof SkillStatus]

export const SKILL_STATUSES = Object.values(SkillStatus) as readonly SkillStatus[]

/** Longest reason kept for a blocked skill. */
export const SKILL_BLOCK_REASON_MAX_LENGTH = 300

/**
 * How long a search the admin asked for keeps others from being asked (`skills-refresh-lock.ts`):
 * the key ends by itself, so a worker that never runs the job does not lock the button for good.
 */
export const SKILLS_REFRESH_LOCK_SECONDS = 30 * 60

/** The weekly search of every enabled source: its scheduler key and when it runs (Monday, 06:00 UTC). */
export const SKILLS_REFRESH_SCHEDULE = { key: 'skills-refresh', pattern: '0 6 * * 1' } as const

/**
 * What the search checks. A found skill is suggested only with at least `minInstalls`
 * installs; at most `githubChecks` skills are checked on GitHub per run (most installed first),
 * `githubChecksWithoutToken` without `SKILLS_GITHUB_TOKEN`, whose rate limit is 60 calls an hour.
 */
export const SKILLS_SEARCH_LIMITS = {
  minInstalls: 500,
  githubChecks: 200,
  githubChecksWithoutToken: 10,
  /**
   * Skills without a description whose skills.sh page is read per run, one request each, so
   * the tagger can tag them: a skill keeps its description, so after the first runs only new ones.
   */
  pageDescriptions: 1000,
} as const

/**
 * Where a skill stands, as the Skills screen filters it: `suggested` (active and eligible: a
 * generation may point to it), `catalogued` (active but failing a check) or `blocked`.
 */
export const SkillState = {
  Suggested: 'suggested',
  Catalogued: 'catalogued',
  Blocked: 'blocked',
} as const

export type SkillState = (typeof SkillState)[keyof typeof SkillState]

export const SKILL_STATES = Object.values(SkillState) as readonly SkillState[]

/**
 * A skill's worst security audit, from worst to best; `none` when skills.sh has no audit for it
 * (a hand-picked skill the search has not matched yet). `unknown` ranks below `medium`: the
 * auditor could not tell, which keeps the skill out of suggestions but is not a finding.
 */
export const SKILL_RISK_LEVELS = [
  'critical',
  'high',
  'medium',
  'unknown',
  'low',
  'safe',
  'none',
] as const

export type SkillRiskLevel = (typeof SKILL_RISK_LEVELS)[number]

/** How `GET /skills` orders the catalog. `trending`: installs gained since the previous run. */
export const SkillSort = {
  Installs: 'installs',
  Trending: 'trending',
  Newest: 'newest',
  Name: 'name',
} as const

export type SkillSort = (typeof SkillSort)[keyof typeof SkillSort]

export const SKILL_SORTS = Object.values(SkillSort) as readonly SkillSort[]

/** How many search runs `GET /skills/stats` and a skill's history go back (half a year). */
export const SKILLS_HISTORY_RUNS = 26

/** Longest search text `GET /skills` takes. */
export const SKILLS_SEARCH_MAX_LENGTH = 100

/**
 * Live updates (`GET /skills/events`): the Redis channel the worker publishes on when the
 * catalog changes, and how often an open stream gets a comment line so proxies keep it open.
 */
export const SKILLS_EVENTS_CHANNEL = 'skills:catalog'
export const SKILLS_EVENTS_HEARTBEAT_MS = 25_000

/**
 * Where the weekly search looks for skills (`skill_sources`): skills.sh, searched with the
 * catalog's plan; Smithery, whose top skills are listed; or a GitHub repository of a trusted
 * publisher, listed whole (or as its `marketplace.json` says). A skill a GitHub source or Smithery
 * lists needs no installs and no audit to be suggested (`TRUSTING_SOURCE_KINDS`); its copy is
 * still scanned and approved by the admin.
 */
export const SkillSourceKind = {
  SkillsSh: 'skills-sh',
  Github: 'github',
  Smithery: 'smithery',
} as const

/** The kinds whose listing is enough to suggest a skill (Smithery lists only `SMITHERY_GATE`). */
export const TRUSTING_SOURCE_KINDS = [SkillSourceKind.Github, SkillSourceKind.Smithery] as const

/** A Smithery skill is listed only when its publisher is verified and its score this high. */
export const SMITHERY_GATE = { minQualityScore: 0.8 } as const

export type SkillSourceKind = (typeof SkillSourceKind)[keyof typeof SkillSourceKind]

export const SKILL_SOURCE_KINDS = Object.values(SkillSourceKind) as readonly SkillSourceKind[]

/**
 * A source contributes at most `skillsPerSource` skills a run (a repository in path order,
 * Smithery in its own order, reading at most `smitheryPages`); a marketplace reads at most
 * `marketplaceRepos` other repositories. A folder is at most `pathMaxLength` characters, and a
 * run's error is kept to `errorMaxLength`.
 */
export const SKILL_SOURCE_LIMITS = {
  skillsPerSource: 100,
  smitheryPages: 5,
  marketplaceRepos: 30,
  pathMaxLength: 200,
  errorMaxLength: 300,
} as const
