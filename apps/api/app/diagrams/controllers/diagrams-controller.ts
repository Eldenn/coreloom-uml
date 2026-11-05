import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import type Architecture from '#app/architectures/models/architecture'
import {
  ARCHITECTURE_NOT_FOUND,
  findOwnedArchitecture,
} from '#app/architectures/services/owned-architecture'
import { DIAGRAM_CONTENT_MAX_BYTES } from '#app/diagrams/constants/diagram'
import type { DiagramContent } from '#app/diagrams/models/diagram'
import { serializeDiagram } from '#app/diagrams/serializers/diagram-serializer'
import { createDiagramInput, updateDiagramInput } from '#app/diagrams/validators/diagrams-input'

const DIAGRAM_NOT_FOUND = { error: { message: 'Diagram not found' } } as const

/** A change to a diagram is a change to its architecture (the date visitors see, RM-26). */
async function touch(architecture: Architecture) {
  architecture.updatedAt = DateTime.now()
  await architecture.save()
}

/** The diagrams (views) of an architecture the signed-in user owns. */
export default class DiagramsController {
  async store({ params, request, auth, response }: HttpContext) {
    const architecture = await findOwnedArchitecture(params.id, auth.getUserOrFail(), {
      withDiagrams: true,
    })
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)

    const { title, kind } = await request.validateUsing(createDiagramInput)
    const position = Math.max(-1, ...architecture.diagrams.map((d) => d.position)) + 1
    const diagram = await architecture
      .related('diagrams')
      .create({ title, kind, content: null, position })
    await touch(architecture)

    return response.created({ diagram: serializeDiagram(diagram) })
  }

  async update({ params, request, auth, response }: HttpContext) {
    const architecture = await findOwnedArchitecture(params.id, auth.getUserOrFail())
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)
    const diagram = await architecture
      .related('diagrams')
      .query()
      .where('id', params.diagramId)
      .first()
    if (!diagram) return response.notFound(DIAGRAM_NOT_FOUND)

    const { title, format, content, version, force } =
      await request.validateUsing(updateDiagramInput)

    if (content !== undefined) {
      if (Buffer.byteLength(JSON.stringify(content)) > DIAGRAM_CONTENT_MAX_BYTES) {
        return response.unprocessableEntity({
          error: { message: 'This diagram is too large (1 MB at most).' },
        })
      }
      // RM-16: two tabs on one diagram — the later save must not silently win.
      if (version !== diagram.version && !force) {
        return response.conflict({
          error: { message: 'This diagram was changed somewhere else.' },
          diagram: serializeDiagram(diagram),
        })
      }
      diagram.content = content as DiagramContent
      diagram.kind = content.kind
      diagram.version += 1
    }
    if (title !== undefined) diagram.title = title
    if (format !== undefined) diagram.format = format
    await diagram.save()
    await touch(architecture)

    return response.ok({ diagram: serializeDiagram(diagram) })
  }

  /** An architecture keeps at least one diagram (RM-18). */
  async destroy({ params, auth, response }: HttpContext) {
    const architecture = await findOwnedArchitecture(params.id, auth.getUserOrFail(), {
      withDiagrams: true,
    })
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)
    const diagram = architecture.diagrams.find((d) => d.id === Number(params.diagramId))
    if (!diagram) return response.notFound(DIAGRAM_NOT_FOUND)

    if (architecture.diagrams.length === 1) {
      return response.conflict({
        error: { message: 'An architecture keeps at least one diagram.' },
      })
    }

    await diagram.delete()
    await touch(architecture)

    return response.noContent()
  }
}
