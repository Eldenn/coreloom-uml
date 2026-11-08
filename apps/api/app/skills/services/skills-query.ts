import db from '@adonisjs/lucid/services/db'
import { AuditRisk, type DiagramKind, SkillOrigin, type SkillTopic } from '@coreloom-uml/catalog'
import { likePattern } from '#app/shared/database/like-pattern'
import {
  SKILL_RISK_LEVELS,
  type SkillRiskLevel,
  SkillSort,
  type SkillState,
  SkillStatus,
} from '#app/skills/constants/skill'
import CatalogSkill from '#app/skills/models/catalog-skill'

/**
 * The SQL behind the Skills screen: the filters of `GET /skills`, their counts, and the derived
 * columns (state, worst audit, installs gained since the previous run). Every expression reads
 * the `skills` table under its own name.
 */

/** Where a skill stands; mirrors `suggestableSkills` in `skills-catalog.ts`. */
export const STATE_SQL = `case
  when skills.status = '${SkillStatus.Blocked}' then 'blocked'
  when skills.origin = '${SkillOrigin.Manual}' then 'suggested'
  when skills.eligible
    and skills.content_sha is not null
    and skills.checked_at is not null
    and jsonb_array_length(skills.affinities) > 0 then 'suggested'
  else 'catalogued'
end`

const AUDITED_RISKS = SKILL_RISK_LEVELS.filter(
  (risk): risk is Exclude<SkillRiskLevel, 'safe' | 'none'> => risk !== 'safe' && risk !== 'none',
)

/** The worst of a skill's audits (`SKILL_RISK_LEVELS` order); `none` without any. */
export const RISK_SQL = `case
  when jsonb_array_length(skills.audits) = 0 then 'none'
  ${AUDITED_RISKS.map(
    (risk) => `when skills.audits @> '[{"risk":"${risk}"}]'::jsonb then '${risk}'`,
  ).join('\n  ')}
  else '${AuditRisk.Safe}'
end`

/** When the last search run happened. */
const LAST_RUN_SQL = '(select max(taken_at) from skill_snapshots)'

/** Installs the skill had at the run before the last one. */
const PREVIOUS_INSTALLS_SQL = `(select previous.installs from skill_snapshots previous
  where previous.skill_id = skills.id and previous.taken_at < ${LAST_RUN_SQL}
  order by previous.taken_at desc limit 1)`

/** Installs gained since the previous run, for skills the last run returned. */
export const DELTA_SQL = `case when skills.last_seen_at = ${LAST_RUN_SQL}
  then skills.installs - ${PREVIOUS_INSTALLS_SQL} end`

export type SkillFilters = {
  search?: string
  topic?: SkillTopic[]
  diagramKind?: DiagramKind[]
  state?: SkillState[]
  risk?: SkillRiskLevel[]
}

export type SkillFacet = Exclude<keyof SkillFilters, 'search'>

type Fragment = { sql: string; bindings: string[] }

/** The `where` of the given filters, leaving one out (to count that filter's values). */
export function filtersSql(filters: SkillFilters, except?: SkillFacet): Fragment {
  const parts: Fragment[] = [{ sql: 'true', bindings: [] }]
  if (filters.search) {
    const pattern = likePattern(filters.search)
    parts.push({
      sql: `(skills.name ilike ? or skills.slug ilike ? or skills.source ilike ?
        or skills.description->>'en' ilike ?)`,
      bindings: [pattern, pattern, pattern, pattern],
    })
  }
  if (filters.topic?.length && except !== 'topic') {
    parts.push(anyOf(filters.topic, (topic) => containsSql('skills.topics', [topic])))
  }
  if (filters.diagramKind?.length && except !== 'diagramKind') {
    parts.push(
      anyOf(filters.diagramKind, (kind) =>
        containsSql('skills.affinities', [{ diagramKinds: [kind] }]),
      ),
    )
  }
  if (filters.state?.length && except !== 'state') {
    parts.push(inSql(STATE_SQL, filters.state))
  }
  if (filters.risk?.length && except !== 'risk') {
    parts.push(inSql(RISK_SQL, filters.risk))
  }
  return {
    sql: parts.map((part) => `(${part.sql})`).join(' and '),
    bindings: parts.flatMap((part) => part.bindings),
  }
}

function containsSql(column: string, value: unknown): Fragment {
  return { sql: `${column} @> ?::jsonb`, bindings: [JSON.stringify(value)] }
}

function anyOf<T>(values: T[], fragment: (value: T) => Fragment): Fragment {
  const parts = values.map(fragment)
  return {
    sql: parts.map((part) => part.sql).join(' or '),
    bindings: parts.flatMap((part) => part.bindings),
  }
}

function inSql(expression: string, values: string[]): Fragment {
  return { sql: `(${expression}) in (${values.map(() => '?').join(', ')})`, bindings: values }
}

/** The catalog's rows matching `filters`, with `state`, `risk` and `installs_delta` in `$extras`. */
export function skillsQuery(filters: SkillFilters, sort: SkillSort = SkillSort.Installs) {
  const where = filtersSql(filters)
  const query = CatalogSkill.query()
    .select('skills.*')
    .select(db.raw(`${STATE_SQL} as state`))
    .select(db.raw(`${RISK_SQL} as risk`))
    .select(db.raw(`${DELTA_SQL} as installs_delta`))
    .whereRaw(where.sql, where.bindings)
  switch (sort) {
    case SkillSort.Trending:
      query
        .orderByRaw('installs_delta desc nulls last')
        .orderByRaw('skills.installs desc nulls last')
      break
    case SkillSort.Newest:
      query.orderByRaw('skills.first_seen_at desc nulls last')
      break
    case SkillSort.Name:
      query.orderBy('skills.name', 'asc')
      break
    default:
      query.orderByRaw('skills.installs desc nulls last')
  }
  return query.orderBy('skills.id', 'asc')
}

/** How many skills match each value of each filter, the other filters applied. */
export async function facetCounts(filters: SkillFilters) {
  // One after the other: inside a transaction they share a single connection.
  const topic = await countBy(filters, 'topic', 'jsonb_array_elements_text(skills.topics)')
  const diagramKind = await countBy(
    filters,
    'diagramKind',
    `jsonb_path_query(skills.affinities, '$[*].diagramKinds[*]') #>> '{}'`,
  )
  const state = await countBy(filters, 'state', STATE_SQL)
  const risk = await countBy(filters, 'risk', RISK_SQL)
  return { topic, diagramKind, state, risk }
}

async function countBy(
  filters: SkillFilters,
  facet: SkillFacet,
  expression: string,
): Promise<Record<string, number>> {
  const where = filtersSql(filters, facet)
  const result: { rows: { value: string; count: string }[] } = await db.rawQuery(
    `select facet.value, count(distinct facet.id) as count
      from (select skills.id, ${expression} as value from skills where ${where.sql}) facet
      group by facet.value`,
    where.bindings,
  )
  return Object.fromEntries(result.rows.map((row) => [row.value, Number(row.count)]))
}
