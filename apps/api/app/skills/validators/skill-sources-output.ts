import type { SkillSourceKind } from '#app/skills/constants/skill'

/** One place the weekly search looks for skills, with how its last run went. */
export type SkillSourceOutput = {
  id: number
  kind: SkillSourceKind
  owner: string | null
  repo: string | null
  path: string | null
  /** `skills.sh`, or `owner/repo[/path]`. */
  label: string
  enabled: boolean
  /** The skills it listed at its last run that answered. */
  skills: number
  lastRunAt: string | null
  lastError: string | null
}
