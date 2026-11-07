import type { HttpContext } from '@adonisjs/core/http'
import { formatDiagramText, validateDiagram } from '@coreloom-uml/uml'
import {
  ARCHITECTURE_NOT_FOUND,
  findOwnedArchitecture,
} from '#app/architectures/services/owned-architecture'
import { serializeDiagram } from '#app/diagrams/serializers/diagram-serializer'
import { checkDiagramText, invalidDiagram } from '#app/diagrams/services/diagram-content'
import {
  DIAGRAM_CHANGED,
  DIAGRAM_NOT_FOUND,
  findArchitectureDiagram,
  touchArchitecture,
} from '#app/diagrams/services/owned-diagram'
import {
  showDiagramSourceInput,
  updateDiagramSourceInput,
} from '#app/diagrams/validators/diagrams-input'
import type { DiagramSourceOutput } from '#app/diagrams/validators/diagrams-output'

/**
 * A diagram read and written as text — Mermaid, PlantUML or JSON — for tools
 * and agents that work on text rather than on the editor's JSON. The stored
 * content stays the UML JSON; the text is converted on the way in and out.
 */
export default class DiagramSourceController {
  async show({ params, request, auth, response }: HttpContext) {
    const architecture = await findOwnedArchitecture(params.id, auth.getUserOrFail())
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)
    const diagram = await findArchitectureDiagram(architecture, params.diagramId)
    if (!diagram) return response.notFound(DIAGRAM_NOT_FOUND)

    const { format = diagram.format } = await request.validateUsing(showDiagramSourceInput)
    let source = ''
    if (diagram.content) {
      // Content saved before the API checked it may not match the schema: say so, don't guess.
      const { diagram: spec, problems } = validateDiagram(diagram.content)
      if (!spec) return response.unprocessableEntity(invalidDiagram(problems))
      source = formatDiagramText(spec, format)
    }

    const output: DiagramSourceOutput = {
      id: diagram.id,
      kind: diagram.kind,
      format,
      source,
      version: diagram.version,
    }
    return response.ok(output)
  }

  /** Replaces the content with the diagram read from the text; its kind becomes the diagram's. */
  async update({ params, request, auth, response }: HttpContext) {
    const architecture = await findOwnedArchitecture(params.id, auth.getUserOrFail())
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)
    const diagram = await findArchitectureDiagram(architecture, params.diagramId)
    if (!diagram) return response.notFound(DIAGRAM_NOT_FOUND)

    const { source, format, version, force } = await request.validateUsing(updateDiagramSourceInput)
    const checked = checkDiagramText(source, format)
    if (!checked.diagram) return response.unprocessableEntity(invalidDiagram(checked.problems))
    // RM-16, as for a content save: a stale version is refused unless forced.
    if (version !== diagram.version && !force) {
      return response.conflict({ error: DIAGRAM_CHANGED, diagram: serializeDiagram(diagram) })
    }

    diagram.content = checked.diagram
    diagram.kind = checked.diagram.kind
    diagram.format = checked.format
    diagram.version += 1
    await diagram.save()
    await touchArchitecture(architecture)

    return response.ok({ diagram: serializeDiagram(diagram), problems: checked.problems })
  }
}
