import type { DiagramKind, SkillAffinity, SkillOrigin, SkillTopic } from '@coreloom-uml/catalog'
import type { Paginated } from '#app/shared/pagination/paginate'
import type { SkillRiskLevel, SkillState } from '#app/skills/constants/skill'
import type { SkillAudit } from '#app/skills/models/catalog-skill'

/** A row of the catalog. */
export type SkillSummaryOutput = {
  slug: string
  name: string
  description: { en: string; fr?: string }
  /** skills.sh's `owner/repo`, `null` for a hand-picked skill not matched yet. */
  source: string | null
  origin: SkillOrigin
  state: SkillState
  topics: string[]
  diagramKinds: DiagramKind[]
  installs: number | null
  /** Installs gained since the previous search run; `null` when it was not seen then. */
  installsDelta: number | null
  risk: SkillRiskLevel
  audits: SkillAudit[]
  firstSeenAt: string | null
}

/** One search run in a skill's history. */
export type SkillHistoryPointOutput = {
  takenAt: string
  installs: number
  eligible: boolean
}

/** One skill with what the catalog knows about it. */
export type SkillDetailOutput = SkillSummaryOutput & {
  url: string
  /** skills.sh's page for it, when it was found there. */
  registryUrl: string | null
  license: string | null
  /** Why it is not suggested: a failed check, or the reason it was blocked. */
  reason: string | null
  affinities: SkillAffinity[]
  lastSeenAt: string | null
  checkedAt: string | null
  /** The last runs that returned it, oldest first. */
  history: SkillHistoryPointOutput[]
}

/** How many skills match each value of a filter, given the other filters. */
export type SkillFacetsOutput = {
  topic: Partial<Record<SkillTopic, number>>
  diagramKind: Partial<Record<DiagramKind, number>>
  state: Partial<Record<SkillState, number>>
  risk: Partial<Record<SkillRiskLevel, number>>
}

/** Shape returned by `GET /skills`. */
export type SkillsListOutput = Paginated<SkillSummaryOutput> & { facets: SkillFacetsOutput }

/** One search run of the catalog. */
export type SkillsRunOutput = {
  takenAt: string
  /** Skills the run returned. */
  skills: number
  /** Their installs, summed. */
  installs: number
  /** Skills seen for the first time by this run. */
  newSkills: number
  /** Skills the run left suggestible. */
  eligible: number
}

/** Shape returned by `GET /skills/stats`: the catalog now, and its last runs (oldest first). */
export type SkillsStatsOutput = {
  totals: {
    skills: number
    suggested: number
    catalogued: number
    blocked: number
    installs: number
  }
  lastRunAt: string | null
  runs: SkillsRunOutput[]
  risks: { risk: SkillRiskLevel; count: number }[]
  topics: { topic: string; count: number }[]
  /** The skills that gained the most installs since the previous run. */
  trending: SkillSummaryOutput[]
}

/** What `GET /skills/events` sends when the catalog changes. */
export type SkillsCatalogEvent = {
  type: 'catalog.refreshed' | 'catalog.updated'
  at: string
}
