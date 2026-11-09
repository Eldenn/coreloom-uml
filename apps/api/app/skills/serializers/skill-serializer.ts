import { DIAGRAM_KINDS, type DiagramKind, isSlotAffinity } from '@coreloom-uml/catalog'
import type { SkillRiskLevel, SkillState } from '#app/skills/constants/skill'
import type CatalogSkill from '#app/skills/models/catalog-skill'
import type SkillSnapshot from '#app/skills/models/skill-snapshot'
import type { SkillDetailOutput, SkillSummaryOutput } from '#app/skills/validators/skills-output'

/** The skills.sh page of a registry id (`owner/repo/slug`). */
const REGISTRY_PAGE = 'https://skills.sh/'

/** The kinds of diagram a skill fits, in `DIAGRAM_KINDS` order. */
function diagramKinds(skill: CatalogSkill): DiagramKind[] {
  const kinds = new Set(
    skill.affinities.flatMap((affinity) => (isSlotAffinity(affinity) ? [] : affinity.diagramKinds)),
  )
  return DIAGRAM_KINDS.filter((kind) => kinds.has(kind))
}

/** A row of `skillsQuery` (its `state`, `risk` and `installs_delta` extras are required). */
export function serializeSkillSummary(skill: CatalogSkill): SkillSummaryOutput {
  const delta = skill.$extras.installs_delta as number | string | null
  return {
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    source: skill.source,
    origin: skill.origin,
    state: skill.$extras.state as SkillState,
    topics: skill.topics,
    diagramKinds: diagramKinds(skill),
    installs: skill.installs,
    installsDelta: delta === null || delta === undefined ? null : Number(delta),
    risk: skill.$extras.risk as SkillRiskLevel,
    audits: skill.audits,
    firstSeenAt: skill.firstSeenAt?.toUTC().toISO() ?? null,
  }
}

export function serializeSkillDetail(
  skill: CatalogSkill,
  history: SkillSnapshot[],
): SkillDetailOutput {
  const summary = serializeSkillSummary(skill)
  return {
    ...summary,
    url: skill.url,
    registryUrl: skill.registryId ? `${REGISTRY_PAGE}${skill.registryId}` : null,
    license: skill.license,
    reason: summary.state === 'blocked' ? skill.statusReason : skill.ineligibleReason,
    affinities: skill.affinities,
    lastSeenAt: skill.lastSeenAt?.toUTC().toISO() ?? null,
    checkedAt: skill.checkedAt?.toUTC().toISO() ?? null,
    history: history.map((snapshot) => ({
      takenAt: snapshot.takenAt.toUTC().toISO() ?? '',
      installs: snapshot.installs,
      eligible: snapshot.eligible,
    })),
  }
}
