import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import {
  SKILL_RISK_LEVELS,
  SKILLS_HISTORY_RUNS,
  type SkillRiskLevel,
  SkillSort,
} from '#app/skills/constants/skill'
import { serializeSkillSummary } from '#app/skills/serializers/skill-serializer'
import { DELTA_SQL, RISK_SQL, STATE_SQL, skillsQuery } from '#app/skills/services/skills-query'
import type { SkillsRunOutput, SkillsStatsOutput } from '#app/skills/validators/skills-output'

/** How many skills `trending` lists. */
const TRENDING_COUNT = 5

/** The catalog now and its last search runs, for the Skills screen's charts. */
export async function skillsStats(): Promise<SkillsStatsOutput> {
  const totals = await catalogTotals()
  const runs = await lastRuns()
  const risks = await riskCounts()
  const topics = await topicCounts()
  const trending = await skillsQuery({}, SkillSort.Trending)
    .whereRaw(`(${DELTA_SQL}) > 0`)
    .limit(TRENDING_COUNT)
  return {
    totals,
    lastRunAt: runs.at(-1)?.takenAt ?? null,
    runs,
    risks,
    topics,
    trending: trending.map(serializeSkillSummary),
  }
}

async function catalogTotals(): Promise<SkillsStatsOutput['totals']> {
  const [row] = await db
    .from('skills')
    .select(
      db.raw('count(*) as skills'),
      db.raw(`count(*) filter (where (${STATE_SQL}) = 'suggested') as suggested`),
      db.raw(`count(*) filter (where (${STATE_SQL}) = 'catalogued') as catalogued`),
      db.raw(`count(*) filter (where (${STATE_SQL}) = 'blocked') as blocked`),
      db.raw('coalesce(sum(installs), 0) as installs'),
    )
  return {
    skills: Number(row.skills),
    suggested: Number(row.suggested),
    catalogued: Number(row.catalogued),
    blocked: Number(row.blocked),
    installs: Number(row.installs),
  }
}

/** The last runs, oldest first: what each returned and how many skills it saw first. */
async function lastRuns(): Promise<SkillsRunOutput[]> {
  const rows: Record<string, string | Date>[] = await db
    .rawQuery(
      `select snapshots.taken_at,
        count(*) as skills,
        coalesce(sum(snapshots.installs), 0) as installs,
        count(*) filter (where snapshots.eligible) as eligible,
        count(*) filter (where snapshots.taken_at = firsts.first_taken_at) as new_skills
      from skill_snapshots snapshots
      join (select skill_id, min(taken_at) as first_taken_at from skill_snapshots group by skill_id)
        firsts on firsts.skill_id = snapshots.skill_id
      group by snapshots.taken_at
      order by snapshots.taken_at desc
      limit ?`,
      [SKILLS_HISTORY_RUNS],
    )
    .then((result) => result.rows)
  return rows.reverse().map((row) => ({
    takenAt:
      DateTime.fromJSDate(row.taken_at as Date)
        .toUTC()
        .toISO() ?? '',
    skills: Number(row.skills),
    installs: Number(row.installs),
    newSkills: Number(row.new_skills),
    eligible: Number(row.eligible),
  }))
}

async function riskCounts(): Promise<SkillsStatsOutput['risks']> {
  const rows: { risk: SkillRiskLevel; count: string }[] = await db
    .from('skills')
    .select(db.raw(`${RISK_SQL} as risk`))
    .count('* as count')
    .groupBy('risk')
  const counts = new Map(rows.map((row) => [row.risk, Number(row.count)]))
  return SKILL_RISK_LEVELS.filter((risk) => counts.has(risk)).map((risk) => ({
    risk,
    count: counts.get(risk) ?? 0,
  }))
}

async function topicCounts(): Promise<SkillsStatsOutput['topics']> {
  const result: { rows: { topic: string; count: string }[] } = await db.rawQuery(
    `select topic, count(*) as count
      from skills, jsonb_array_elements_text(skills.topics) as topic
      group by topic
      order by count desc, topic asc`,
  )
  return result.rows.map((row) => ({ topic: row.topic, count: Number(row.count) }))
}
