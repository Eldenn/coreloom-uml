import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { ArchitectureVisibility } from '#app/architectures/constants/visibility'
import Architecture from '#app/architectures/models/architecture'
import {
  serializeArchitectureDetail,
  serializeArchitectureSummary,
} from '#app/architectures/serializers/architecture-serializer'
import {
  ARCHITECTURE_NOT_FOUND,
  findOwnedArchitecture,
} from '#app/architectures/services/owned-architecture'
import {
  createArchitectureInput,
  listArchitecturesInput,
  updateArchitectureInput,
} from '#app/architectures/validators/architectures-input'
import { DEFAULT_DIAGRAM } from '#app/diagrams/constants/diagram'
import { paginate } from '#app/shared/pagination/paginate'

/** Escapes LIKE wildcards so a search for `50%` matches the text `50%`. */
function likePattern(search: string) {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

/**
 * The signed-in user's architectures — the reference user-owned resource:
 * owner-scoped, a resource that isn't yours reads as 404.
 */
export default class ArchitecturesController {
  async index({ request, auth, response }: HttpContext) {
    const { page, perPage, search, visibility } =
      await request.validateUsing(listArchitecturesInput)
    const user = auth.getUserOrFail()

    const query = Architecture.query()
      .where('userId', user.id)
      .preload('diagrams', (diagrams) => diagrams.orderBy('position', 'asc'))
      .orderBy('updatedAt', 'desc')
      .orderBy('id', 'desc')
    if (search) query.whereILike('title', likePattern(search))
    if (visibility) query.where('visibility', visibility)

    return response.ok(await paginate(query, { page, perPage }, serializeArchitectureSummary))
  }

  async store({ request, auth, response }: HttpContext) {
    const { title, description, diagram } = await request.validateUsing(createArchitectureInput)
    const user = auth.getUserOrFail()

    const architecture = await db.transaction(async (trx) => {
      const created = await Architecture.create(
        {
          userId: user.id,
          title,
          description: description ?? null,
          visibility: ArchitectureVisibility.Private,
        },
        { client: trx },
      )
      await created.related('diagrams').create({
        title: diagram?.title ?? DEFAULT_DIAGRAM.title,
        kind: diagram?.kind ?? DEFAULT_DIAGRAM.kind,
        content: null,
        position: 0,
      })
      await created.load('diagrams')
      return created
    })

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
    const architecture = await findOwnedArchitecture(params.id, auth.getUserOrFail(), {
      withDiagrams: true,
    })
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)

    const { title, description } = await request.validateUsing(updateArchitectureInput)
    if (title !== undefined) architecture.title = title
    if (description !== undefined) architecture.description = description
    await architecture.save()

    return response.ok({ architecture: serializeArchitectureDetail(architecture) })
  }

  /** Its diagrams go with it (cascade), and with them its share link (RM-18). */
  async destroy({ params, auth, response }: HttpContext) {
    const architecture = await findOwnedArchitecture(params.id, auth.getUserOrFail())
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)

    await architecture.delete()

    return response.noContent()
  }
}
