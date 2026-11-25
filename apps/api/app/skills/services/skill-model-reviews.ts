import type { SkillReviewResult, SkillReviewSource } from '@coreloom-uml/llm'
import { SkillScanStatus } from '#app/skills/constants/skill-scan'
import type SkillVersion from '#app/skills/models/skill-version'
import { readSkillVersionFiles } from '#app/skills/services/skill-versions'

/**
 * What `skill_versions.model_review` holds: the admin's own model reading one copy next to
 * SkillSpector's scan (`reviewSkill`, `packages/llm/src/skill-review.ts`), asked from the copy's
 * sheet with the key of that request only. It helps the admin read; it never changes whether a
 * copy may be approved (`approvalProblem` does not read it), since the files are a stranger's and
 * may address the model.
 */
export type SkillModelReview = Omit<SkillReviewResult, 'dropped'> & {
  /** The provider kind and the model that answered, as the admin set them. */
  model: string
  reviewedAt: string
}

/**
 * What the model is given: the copy's files (read from Drive, never from GitHub) and, when
 * SkillSpector scanned it, its findings and the passages it left unchecked.
 */
export async function modelReviewSource(
  version: SkillVersion,
  locale: SkillReviewSource['locale'],
): Promise<SkillReviewSource> {
  const scan = version.scan?.status === SkillScanStatus.Done ? version.scan : null
  return {
    skill: { name: version.skill.name },
    files: await readSkillVersionFiles(version),
    findings: scan?.findings ?? [],
    gaps: scan?.gaps ?? [],
    locale,
  }
}
