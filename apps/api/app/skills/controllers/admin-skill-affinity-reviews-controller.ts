import type { HttpContext } from '@adonisjs/core/http'
import {
  affinityReviewsEnabled,
  decideAffinity,
  listAffinityReviews,
} from '#app/skills/services/skill-affinity-reviews'
import { decideAffinityInput, listAffinityReviewsInput } from '#app/skills/validators/skills-input'

const NOT_FOUND = { error: { message: 'Not found' } }

/**
 * The pairs of a skill and a ready-made rule the scoring proposed, for the admin to accept,
 * reject or mark as going against (`middleware.admin()`, behind `computed-skill-affinities`).
 * A decision counts from the next generation on, whatever the model; nothing is scored here.
 */
export default class AdminSkillAffinityReviewsController {
  async index({ auth, request, response }: HttpContext) {
    if (!(await affinityReviewsEnabled(auth.getUserOrFail()))) return response.notFound(NOT_FOUND)
    const filters = await request.validateUsing(listAffinityReviewsInput)
    return response.ok(await listAffinityReviews(filters))
  }

  async update({ auth, params, request, response }: HttpContext) {
    if (!(await affinityReviewsEnabled(auth.getUserOrFail()))) return response.notFound(NOT_FOUND)
    const { decision } = await request.validateUsing(decideAffinityInput)
    // A run of the tagger replaces the pending pairs: an id gone is a pair proposed no more.
    if (!(await decideAffinity(Number(params.id), decision))) return response.notFound(NOT_FOUND)
    return response.ok({ decision })
  }
}
