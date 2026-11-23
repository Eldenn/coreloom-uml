import type { HttpContext } from '@adonisjs/core/http'
import { serializeArchitectureDetail } from '#app/architectures/serializers/architecture-serializer'
import {
  ARCHITECTURE_NOT_FOUND,
  findOwnedArchitecture,
} from '#app/architectures/services/owned-architecture'
import { invalidDiagram } from '#app/diagrams/services/diagram-content'
import {
  findArchitectureMilestone,
  MILESTONE_NOT_FOUND,
  restoreMilestone,
} from '#app/milestones/services/milestone-writes'

/**
 * `POST /architectures/:id/milestones/:milestoneId/restore`: the architecture's views become the
 * milestone's again. What was there is not kept: the owner makes a milestone of it first.
 */
export default class RestoreMilestoneController {
  async handle({ params, auth, response }: HttpContext) {
    const architecture = await findOwnedArchitecture(params.id, auth.getUserOrFail())
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)
    const milestone = await findArchitectureMilestone(architecture, params.milestoneId)
    if (!milestone) return response.notFound(MILESTONE_NOT_FOUND)

    const restored = await restoreMilestone(architecture, milestone)
    if ('problems' in restored) {
      return response.unprocessableEntity(invalidDiagram(restored.problems))
    }
    return response.ok({ architecture: serializeArchitectureDetail(restored) })
  }
}
