/**
 * Where a copy of a skill's files stands: `pending` until the admin has read it (with its diff
 * against the previous approved copy), then `approved` (it may be installed) or `rejected`.
 */
export const SkillVersionStatus = {
  Pending: 'pending',
  Approved: 'approved',
  Rejected: 'rejected',
} as const

export type SkillVersionStatus = (typeof SkillVersionStatus)[keyof typeof SkillVersionStatus]

export const SKILL_VERSION_STATUSES = Object.values(
  SkillVersionStatus,
) as readonly SkillVersionStatus[]

/**
 * The `copy` filter of `GET /skills` (admin only): the statuses of the copies a skill has, or
 * `none` when it has no copy.
 */
export const SKILL_COPY_NONE = 'none'
export const SKILL_COPY_STATES = [...SKILL_VERSION_STATUSES, SKILL_COPY_NONE] as const
export type SkillCopyState = (typeof SKILL_COPY_STATES)[number]

/** What the admin can set a copy to. */
export const SKILL_VERSION_DECISIONS = [
  SkillVersionStatus.Approved,
  SkillVersionStatus.Rejected,
] as const

/**
 * What a copied skill may hold: text files only, at most `files` of them and `bytes` together; at
 * most `capturesPerRun` new copies are downloaded per search run (the others wait for the next).
 */
export const SKILL_VERSION_LIMITS = {
  files: 200,
  bytes: 512 * 1024,
  capturesPerRun: 30,
} as const

/** The Drive folder of the copies: `<folder>/<skill slug>/<content sha>.json.gz`. */
export const SKILL_VERSIONS_STORAGE_FOLDER = 'skill-versions'

/** `license` of a copy whose folder holds its own licence file. */
export const LICENSE_IN_FOLDER = 'in-folder'
