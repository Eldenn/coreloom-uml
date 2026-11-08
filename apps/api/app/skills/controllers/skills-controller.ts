import type { HttpContext } from '@adonisjs/core/http'
import { paginate } from '#app/shared/pagination/paginate'
import { SKILLS_HISTORY_RUNS, SkillSort } from '#app/skills/constants/skill'
import SkillSnapshot from '#app/skills/models/skill-snapshot'
import {
  serializeSkillDetail,
  serializeSkillSummary,
} from '#app/skills/serializers/skill-serializer'
import { facetCounts, skillsQuery } from '#app/skills/services/skills-query'
import { skillsStats } from '#app/skills/services/skills-stats'
import { listSkillsInput } from '#app/skills/validators/skills-input'
import type { SkillsListOutput } from '#app/skills/validators/skills-output'

const SKILL_NOT_FOUND = { error: { message: 'Skill not found' } }

/**
 * The skills catalog (hand-picked and found on skills.sh), read-only: shared by every account,
 * kept up to date by the weekly search (`RefreshSkillsJob`).
 */
export default class SkillsController {
  async index({ request, response }: HttpContext) {
    const { page, perPage, sort, ...filters } = await request.validateUsing(listSkillsInput)

    const list = await paginate(
      skillsQuery(filters, sort ?? SkillSort.Installs),
      { page, perPage },
      serializeSkillSummary,
    )
    const output: SkillsListOutput = { ...list, facets: await facetCounts(filters) }
    return response.ok(output)
  }

  async stats({ response }: HttpContext) {
    return response.ok(await skillsStats())
  }

  async show({ params, response }: HttpContext) {
    const skill = await skillsQuery({}).where('skills.slug', String(params.slug)).first()
    if (!skill) return response.notFound(SKILL_NOT_FOUND)

    const history = await SkillSnapshot.query()
      .where('skillId', skill.id)
      .orderBy('takenAt', 'desc')
      .limit(SKILLS_HISTORY_RUNS)
    return response.ok({ skill: serializeSkillDetail(skill, history.reverse()) })
  }
}
