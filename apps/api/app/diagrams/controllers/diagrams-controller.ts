import type { HttpContext } from '@adonisjs/core/http'
import {
  ARCHITECTURE_NOT_FOUND,
  findOwnedArchitecture,
} from '#app/architectures/services/owned-architecture'
import { DiagramFormat } from '#app/diagrams/constants/diagram'
import { serializeDiagram } from '#app/diagrams/serializers/diagram-serializer'
import {
  checkDiagramText,
  checkDiagramValue,
  invalidDiagram,
} from '#app/diagrams/services/diagram-content'
import {
  DIAGRAM_CHANGED,
  DIAGRAM_NOT_FOUND,
  findArchitectureDiagram,
  touchArchitecture,
} from '#app/diagrams/services/owned-diagram'
import { createDiagramInput, updateDiagramInput } from '#app/diagrams/validators/diagrams-input'

/** The diagrams (views) of an architecture the signed-in user owns. */
export default class DiagramsController {
  /** Empty, or read from `source` (Mermaid, PlantUML or JSON text): then a 422 lists its problems. */
  async store({ params, request, auth, response }: HttpContext) {
    const architecture = await findOwnedArchitecture(params.id, auth.getUserOrFail(), {
      withDiagrams: true,
    })
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)

    const { title, kind, source, format } = await request.validateUsing(createDiagramInput)
    const checked = source === undefined ? null : checkDiagramText(source, format)
    if (checked && !checked.diagram) {
      return response.unprocessableEntity(invalidDiagram(checked.problems))
    }
    const content = checked?.diagram ?? null
    if (content && kind && content.kind !== kind) {
      return response.unprocessableEntity({
        error: { message: `The text is a ${content.kind} diagram, not a ${kind} diagram.` },
      })
    }

    const position = Math.max(-1, ...architecture.diagrams.map((d) => d.position)) + 1
    const diagram = await architecture.related('diagrams').create({
      title,
      kind: content?.kind ?? kind,
      content,
      position,
      // Set here rather than left to the column defaults, which `create` doesn't read back.
      format: checked?.format ?? DiagramFormat.Mermaid,
      version: 1,
    })
    await touchArchitecture(architecture)

    return response.created({
      diagram: serializeDiagram(diagram),
      problems: checked?.problems ?? [],
    })
  }

  async update({ params, request, auth, response }: HttpContext) {
    const architecture = await findOwnedArchitecture(params.id, auth.getUserOrFail())
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)
    const diagram = await findArchitectureDiagram(architecture, params.diagramId)
    if (!diagram) return response.notFound(DIAGRAM_NOT_FOUND)

    const { title, format, content, version, force } =
      await request.validateUsing(updateDiagramInput)

    if (content !== undefined) {
      // Checked against the shared UML schema (and the 1 MB limit) before anything else.
      const checked = checkDiagramValue(content)
      if (!checked.diagram) return response.unprocessableEntity(invalidDiagram(checked.problems))
      // RM-16: two tabs on one diagram — the later save must not silently win.
      if (version !== diagram.version && !force) {
        return response.conflict({ error: DIAGRAM_CHANGED, diagram: serializeDiagram(diagram) })
      }
      diagram.content = checked.diagram
      diagram.kind = checked.diagram.kind
      diagram.version += 1
    }
    if (title !== undefined) diagram.title = title
    if (format !== undefined) diagram.format = format
    await diagram.save()
    await touchArchitecture(architecture)

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
    await touchArchitecture(architecture)

    return response.noContent()
  }
}
