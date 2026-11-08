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

/** The weekly search on skills.sh: its scheduler key and when it runs (Monday, 06:00 UTC). */
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
} as const
