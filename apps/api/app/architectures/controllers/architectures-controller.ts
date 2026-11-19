import type { HttpContext } from '@adonisjs/core/http'
import Architecture from '#app/architectures/models/architecture'
import {
  serializeArchitectureDetail,
  serializeArchitectureSummary,
} from '#app/architectures/serializers/architecture-serializer'
import {
  createArchitecture,
  deleteArchitecture,
  updateArchitecture,
} from '#app/architectures/services/architecture-writes'
import {
  ARCHITECTURE_NOT_FOUND,
  findOwnedArchitecture,
} from '#app/architectures/services/owned-architecture'
import {
  createArchitectureInput,
  listArchitecturesInput,
  updateArchitectureInput,
} from '#app/architectures/validators/architectures-input'
import { PROJECT_NOT_FOUND } from '#app/projects/services/owned-project'
import { likePattern } from '#app/shared/database/like-pattern'
import { paginate } from '#app/shared/pagination/paginate'

/**
 * The signed-in user's architectures — the reference user-owned resource:
 * owner-scoped, a resource that isn't yours reads as 404.
 */
export default class ArchitecturesController {
  async index({ request, auth, response }: HttpContext) {
    const { page, perPage, projectId, search, visibility } =
      await request.validateUsing(listArchitecturesInput)
    const user = auth.getUserOrFail()

    const query = Architecture.query()
      .where('userId', user.id)
      .preload('diagrams', (diagrams) => diagrams.orderBy('position', 'asc'))
      .orderBy('updatedAt', 'desc')
      .orderBy('id', 'desc')
    if (projectId) query.where('projectId', projectId)
    if (search) query.whereILike('title', likePattern(search))
    if (visibility) query.where('visibility', visibility)

    return response.ok(await paginate(query, { page, perPage }, serializeArchitectureSummary))
  }

  async store({ request, auth, response }: HttpContext) {
    const fields = await request.validateUsing(createArchitectureInput)
    const architecture = await createArchitecture(auth.getUserOrFail(), fields)
    if (!architecture) return response.notFound(PROJECT_NOT_FOUND)

    return response.created({ architecture: serializeArchitectureDetail(architecture) })
  }

  async show({ params, auth, response }: HttpContext) {
    const architecture = await findOwnedArchitecture(params.id, auth.getUserOrFail(), {
      withDiagrams: true,
    })
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)

    return response.ok({ architecture: serializeArchitectureDetail(architecture) })
  }

  async update({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const architecture = await findOwnedArchitecture(params.id, user, { withDiagrams: true })
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)

    const fields = await request.validateUsing(updateArchitectureInput)
    if (!(await updateArchitecture(architecture, user, fields)))
      return response.notFound(PROJECT_NOT_FOUND)

    return response.ok({ architecture: serializeArchitectureDetail(architecture) })
  }

  /** Its diagrams go with it (cascade), and with them its share link (RM-18). */
  async destroy({ params, auth, response }: HttpContext) {
    const architecture = await findOwnedArchitecture(params.id, auth.getUserOrFail())
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)

    await deleteArchitecture(architecture)

    return response.noContent()
  }
}
