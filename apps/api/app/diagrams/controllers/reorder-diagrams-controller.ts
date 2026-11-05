import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import {
  ARCHITECTURE_NOT_FOUND,
  findOwnedArchitecture,
} from '#app/architectures/services/owned-architecture'
import { serializeDiagram } from '#app/diagrams/serializers/diagram-serializer'
import { reorderDiagramsInput } from '#app/diagrams/validators/diagrams-input'

/** Puts an architecture's diagrams in the given order; the ids must be exactly its diagrams. */
export default class ReorderDiagramsController {
  async handle({ params, request, auth, response }: HttpContext) {
    const architecture = await findOwnedArchitecture(params.id, auth.getUserOrFail(), {
      withDiagrams: true,
    })
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)

    const { ids } = await request.validateUsing(reorderDiagramsInput)
    const byId = new Map(architecture.diagrams.map((d) => [d.id, d]))
    if (ids.length !== byId.size || !ids.every((id) => byId.has(id))) {
      return response.unprocessableEntity({
        error: { message: 'The order must list every diagram of the architecture once.' },
      })
    }

    await db.transaction(async (trx) => {
      for (const [position, id] of ids.entries()) {
        const diagram = byId.get(id)
        if (!diagram || diagram.position === position) continue
        diagram.useTransaction(trx)
        diagram.position = position
        await diagram.save()
      }
      architecture.useTransaction(trx)
      architecture.updatedAt = DateTime.now()
      await architecture.save()
    })

    const ordered = ids.flatMap((id) => {
      const diagram = byId.get(id)
      return diagram ? [serializeDiagram(diagram)] : []
    })
    return response.ok({ diagrams: ordered })
  }
}
