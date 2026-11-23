import type { HttpContext } from '@adonisjs/core/http'
import {
  ARCHITECTURE_NOT_FOUND,
  findOwnedArchitecture,
} from '#app/architectures/services/owned-architecture'
import Milestone from '#app/milestones/models/milestone'
import {
  serializeMilestone,
  serializeMilestoneDetail,
} from '#app/milestones/serializers/milestone-serializer'
import {
  createMilestone,
  findArchitectureMilestone,
  MILESTONE_NOT_FOUND,
  MILESTONES_FULL,
} from '#app/milestones/services/milestone-writes'
import {
  createMilestoneInput,
  listMilestonesInput,
} from '#app/milestones/validators/milestones-input'
import { paginate } from '#app/shared/pagination/paginate'

/** The milestones of an architecture the signed-in user owns: named states of all its views. */
export default class MilestonesController {
  /** `GET /architectures/:id/milestones`: the newest first, without the views they keep. */
  async index({ params, request, auth, response }: HttpContext) {
    const { page, perPage } = await request.validateUsing(listMilestonesInput)
    const architecture = await findOwnedArchitecture(params.id, auth.getUserOrFail())
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)

    const query = Milestone.query()
      .select('id', 'architectureId', 'name', 'diagramCount', 'createdAt')
      .where('architectureId', architecture.id)
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
    return response.ok(await paginate(query, { page, perPage }, serializeMilestone))
  }

  /** `POST /architectures/:id/milestones`: keeps the views as they are saved now. */
  async store({ params, request, auth, response }: HttpContext) {
    const { name } = await request.validateUsing(createMilestoneInput)
    const architecture = await findOwnedArchitecture(params.id, auth.getUserOrFail())
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)

    const milestone = await createMilestone(architecture, name)
    if (milestone === 'full') return response.conflict(MILESTONES_FULL)
    return response.created({ milestone: serializeMilestone(milestone) })
  }

  /** `GET /architectures/:id/milestones/:milestoneId`: with the views it keeps. */
  async show({ params, auth, response }: HttpContext) {
    const architecture = await findOwnedArchitecture(params.id, auth.getUserOrFail())
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)
    const milestone = await findArchitectureMilestone(architecture, params.milestoneId)
    if (!milestone) return response.notFound(MILESTONE_NOT_FOUND)

    return response.ok({ milestone: serializeMilestoneDetail(milestone) })
  }

  /** `DELETE /architectures/:id/milestones/:milestoneId` */
  async destroy({ params, auth, response }: HttpContext) {
    const architecture = await findOwnedArchitecture(params.id, auth.getUserOrFail())
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)
    const milestone = await findArchitectureMilestone(architecture, params.milestoneId)
    if (!milestone) return response.notFound(MILESTONE_NOT_FOUND)

    await milestone.delete()
    return response.noContent()
  }
}
