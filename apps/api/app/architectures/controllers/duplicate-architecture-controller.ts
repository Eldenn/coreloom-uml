import type { HttpContext } from '@adonisjs/core/http'
import { serializeArchitectureDetail } from '#app/architectures/serializers/architecture-serializer'
import { duplicateArchitecture } from '#app/architectures/services/architecture-writes'
import {
  ARCHITECTURE_NOT_FOUND,
  findOwnedArchitecture,
} from '#app/architectures/services/owned-architecture'

/**
 * RM-19: the copy holds the same diagrams, lands in the same project and
 * starts private, with no link and no code.
 */
export default class DuplicateArchitectureController {
  async handle({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const source = await findOwnedArchitecture(params.id, user, { withDiagrams: true })
    if (!source) return response.notFound(ARCHITECTURE_NOT_FOUND)

    const copy = await duplicateArchitecture(source, user)
    return response.created({ architecture: serializeArchitectureDetail(copy) })
  }
}
