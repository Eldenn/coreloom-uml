import type { HttpContext } from '@adonisjs/core/http'
import { checkDiagramText, checkDiagramValue } from '#app/diagrams/services/diagram-content'
import { validateDiagramInput } from '#app/diagrams/validators/diagrams-input'
import type { DiagramValidationOutput } from '#app/diagrams/validators/diagrams-output'

/**
 * Checks a diagram without storing it, the way a save would: text in
 * `source` (Mermaid, PlantUML or JSON), or JSON in `content`. Always a 200:
 * `valid` and `problems` say what a save would make of it.
 */
export default class ValidateDiagramController {
  async handle({ request, response }: HttpContext) {
    const { source, format, content } = await request.validateUsing(validateDiagramInput)
    const checked =
      source !== undefined ? checkDiagramText(source, format) : checkDiagramValue(content)

    const output: DiagramValidationOutput = {
      valid: checked.diagram !== null,
      format: checked.format,
      kind: checked.diagram?.kind ?? null,
      diagram: checked.diagram,
      problems: checked.problems,
    }
    return response.ok(output)
  }
}
