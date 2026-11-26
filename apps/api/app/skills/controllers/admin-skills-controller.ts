import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import RefreshSkillsJob from '#app/jobs/refresh-skills_job'
import { setSkillBlocked } from '#app/skills/services/skills-catalog'
import SkillsEvents from '#app/skills/services/skills-events'
import {
  acquireSkillsRefresh,
  releaseSkillsRefresh,
} from '#app/skills/services/skills-refresh-lock'
import { blockSkillInput } from '#app/skills/validators/skills-input'

/**
 * What the admin does to the catalog from the Skills screen (`middleware.admin()`), the commands
 * `skills:block` and `skills:refresh` as routes.
 */
export default class AdminSkillsController {
  /** Takes a skill out of the suggestions, with why, or puts it back. */
  async update({ params, request, response }: HttpContext) {
    const { blocked, reason } = await request.validateUsing(blockSkillInput)
    const found = await setSkillBlocked(String(params.slug), blocked, reason)
    if (!found) return response.notFound({ error: { message: 'Skill not found' } })
    await (await app.container.make(SkillsEvents)).publish('catalog.updated')
    return response.ok({ blocked })
  }

  /**
   * Reads every enabled source now instead of at the next weekly run. The job does it (no request
   * handler calls skills.sh or GitHub); one asked search at a time.
   */
  async refresh({ response }: HttpContext) {
    if (!(await acquireSkillsRefresh())) {
      return response.conflict({ error: { message: 'A search is already running' } })
    }
    try {
      await RefreshSkillsJob.dispatch({})
    } catch (error) {
      await releaseSkillsRefresh()
      throw error
    }
    return response.accepted({ queued: true })
  }
}
