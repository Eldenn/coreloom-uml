import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import { DateTime } from 'luxon'
import ClassifySkillTopicsJob from '#app/jobs/classify-skill-topics_job'
import CatalogSkill from '#app/skills/models/catalog-skill'
import { effectiveTopics } from '#app/skills/services/skill-topics'
import SkillsEvents from '#app/skills/services/skills-events'
import { reviewSkillTopicsInput } from '#app/skills/validators/skills-input'
import type { SkillTopicsOutput } from '#app/skills/validators/skills-output'

/**
 * The admin sets a skill's tags (`middleware.admin()`): they replace the tagger's and the search's
 * at once, and a tagging run is queued (`ClassifySkillTopicsJob`), which learns from the main one
 * and retags the catalog within seconds. No request handler runs the tagger itself.
 */
export default class AdminSkillTopicsController {
  async update({ params, request, response }: HttpContext) {
    const { topics } = await request.validateUsing(reviewSkillTopicsInput)
    const skill = await CatalogSkill.findBy('slug', String(params.slug))
    if (!skill) return response.notFound({ error: { message: 'Skill not found' } })
    await skill
      .merge({
        reviewedTopics: topics,
        reviewedAt: topics ? DateTime.now() : null,
        topics: effectiveTopics(skill.searchTopics, skill.taggerTopics, topics),
      })
      .save()
    await ClassifySkillTopicsJob.dispatch({})
    await (await app.container.make(SkillsEvents)).publish('catalog.updated')
    const output: SkillTopicsOutput = { topics: skill.topics, reviewedTopics: topics }
    return response.ok(output)
  }
}
