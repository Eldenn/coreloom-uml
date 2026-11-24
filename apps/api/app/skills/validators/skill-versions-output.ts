import type { Paginated } from '#app/shared/pagination/paginate'
import type { SkillVersionStatus } from '#app/skills/constants/skill-version'
import type { SkillVersionFile } from '#app/skills/models/skill-version'
import type { SkillBundleFile } from '#app/skills/services/skill-versions'

/** A copy of a skill's files, without the files. */
export type SkillVersionOutput = {
  id: number
  skill: { slug: string; name: string; origin: string }
  contentSha: string
  repository: string
  commit: string
  folder: string
  /** `https://github.com/<repository>/tree/<commit>/<folder>`. */
  url: string
  license: string
  files: SkillVersionFile[]
  bytes: number
  status: SkillVersionStatus
  reviewedAt: string | null
  createdAt: string
}

export type SkillVersionsOutput = Paginated<SkillVersionOutput>

/** One copy with its files and, to diff against, the previous approved copy's. */
export type SkillVersionDetailOutput = {
  version: SkillVersionOutput
  files: SkillBundleFile[]
  previous: { version: SkillVersionOutput; files: SkillBundleFile[] } | null
}
