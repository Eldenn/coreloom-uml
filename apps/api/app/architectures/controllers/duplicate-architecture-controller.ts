import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import {
  ARCHITECTURE_COPY_SUFFIX,
  ARCHITECTURE_TITLE_MAX_LENGTH,
} from '#app/architectures/constants/limits'
import { ArchitectureVisibility } from '#app/architectures/constants/visibility'
import Architecture from '#app/architectures/models/architecture'
import { serializeArchitectureDetail } from '#app/architectures/serializers/architecture-serializer'
import {
  ARCHITECTURE_NOT_FOUND,
  findOwnedArchitecture,
} from '#app/architectures/services/owned-architecture'

/** RM-19: the copy holds the same diagrams and starts private, with no link and no code. */
export default class DuplicateArchitectureController {
  async handle({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const source = await findOwnedArchitecture(params.id, user, { withDiagrams: true })
    if (!source) return response.notFound(ARCHITECTURE_NOT_FOUND)

    const title = `${source.title.slice(0, ARCHITECTURE_TITLE_MAX_LENGTH - ARCHITECTURE_COPY_SUFFIX.length)}${ARCHITECTURE_COPY_SUFFIX}`

    const copy = await db.transaction(async (trx) => {
      const created = await Architecture.create(
        {
          userId: user.id,
          title,
          description: source.description,
          visibility: ArchitectureVisibility.Private,
        },
        { client: trx },
      )
      await created.related('diagrams').createMany(
        source.diagrams.map((diagram) => ({
          title: diagram.title,
          kind: diagram.kind,
          format: diagram.format,
          content: diagram.content,
          position: diagram.position,
        })),
      )
      await created.load('diagrams', (diagrams) => diagrams.orderBy('position', 'asc'))
      return created
    })

    return response.created({ architecture: serializeArchitectureDetail(copy) })
  }
}
