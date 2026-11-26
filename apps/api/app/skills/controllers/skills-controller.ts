import type { HttpContext } from '@adonisjs/core/http'
import { SkillOrigin } from '@coreloom-uml/catalog'
import { isDefaultAccount } from '#app/auth/services/default-account'
import { paginate } from '#app/shared/pagination/paginate'
import { SKILLS_HISTORY_RUNS, SkillSort, SkillStatus } from '#app/skills/constants/skill'
import { SkillVersionStatus } from '#app/skills/constants/skill-version'
import CatalogSkill from '#app/skills/models/catalog-skill'
import SkillSnapshot from '#app/skills/models/skill-snapshot'
import SkillVersion from '#app/skills/models/skill-version'
import {
  serializeSkillDetail,
  serializeSkillSummary,
} from '#app/skills/serializers/skill-serializer'
import {
  installName,
  newestApproved,
  readSkillVersionFiles,
} from '#app/skills/services/skill-versions'
import { facetCounts, skillsQuery } from '#app/skills/services/skills-query'
import { skillsStats } from '#app/skills/services/skills-stats'
import { listSkillsInput, skillCopyInput } from '#app/skills/validators/skills-input'
import type { SkillCopyOutput, SkillsListOutput } from '#app/skills/validators/skills-output'

const SKILL_NOT_FOUND = { error: { message: 'Skill not found' } }
const NO_APPROVED_COPY = { error: { message: 'No approved copy of this skill' } }

/**
 * The skills catalog (hand-picked and found on skills.sh), read-only: shared by every account,
 * kept up to date by the weekly search (`RefreshSkillsJob`).
 */
export default class SkillsController {
  async index({ auth, request, response }: HttpContext) {
    const { page, perPage, sort, copy, ...rest } = await request.validateUsing(listSkillsInput)
    // Which skills have a copy, and in what state, is the admin's to see.
    const admin = isDefaultAccount(auth.getUserOrFail())
    const filters = admin ? { ...rest, copy } : rest

    const list = await paginate(
      skillsQuery(filters, sort ?? SkillSort.Installs),
      { page, perPage },
      serializeSkillSummary,
    )
    const output: SkillsListOutput = { ...list, facets: await facetCounts(filters, admin) }
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

  /**
   * The newest copy the admin approved, of a skill still active and eligible (blocked, or found
   * ineligible since, it is not served): never a pending or rejected copy, never from GitHub.
   * With `version`, that copy instead (the one a generation recorded), if it is an approved copy
   * of this skill.
   */
  async copy({ params, request, response }: HttpContext) {
    const { version: versionId } = await request.validateUsing(skillCopyInput)
    const skill = await CatalogSkill.query()
      .where('slug', String(params.slug))
      .where('status', SkillStatus.Active)
      .where((query) => query.where('origin', SkillOrigin.Manual).orWhere('eligible', true))
      .first()
    const version = !skill
      ? null
      : versionId
        ? await SkillVersion.query()
            .where('id', versionId)
            .where('skillId', skill.id)
            .where('status', SkillVersionStatus.Approved)
            .first()
        : await newestApproved(skill.id)
    if (!skill || !version) return response.notFound(NO_APPROVED_COPY)

    const files = await readSkillVersionFiles(version)
    const copy: SkillCopyOutput = {
      slug: skill.slug,
      name: installName(files, skill.slug),
      repository: version.repository,
      commit: version.commit,
      license: version.license,
      files,
    }
    return response.ok({ copy })
  }
}
