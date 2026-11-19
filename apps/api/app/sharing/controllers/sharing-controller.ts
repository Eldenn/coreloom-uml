import type { HttpContext } from '@adonisjs/core/http'
import {
  ARCHITECTURE_NOT_FOUND,
  findOwnedArchitecture,
} from '#app/architectures/services/owned-architecture'
import { serializeSharing } from '#app/sharing/serializers/sharing-serializer'
import {
  NOT_PROTECTED_MESSAGE,
  regenerateAccessCode,
  regenerateShareLink,
  setVisibility,
} from '#app/sharing/services/sharing'
import { updateSharingInput } from '#app/sharing/validators/sharing-input'

/** The owner's side of sharing: visibility, link and code (RM-20 to RM-24). */
export default class SharingController {
  async show({ params, auth, response }: HttpContext) {
    const architecture = await findOwnedArchitecture(params.id, auth.getUserOrFail())
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)

    return response.ok({ sharing: serializeSharing(architecture) })
  }

  async update({ params, request, auth, response }: HttpContext) {
    const architecture = await findOwnedArchitecture(params.id, auth.getUserOrFail())
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)

    const { visibility } = await request.validateUsing(updateSharingInput)
    await setVisibility(architecture, visibility)

    return response.ok({ sharing: serializeSharing(architecture) })
  }

  /** RM-21: the old link stops working at once. */
  async regenerateLink({ params, auth, response }: HttpContext) {
    const architecture = await findOwnedArchitecture(params.id, auth.getUserOrFail())
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)

    await regenerateShareLink(architecture)

    return response.ok({ sharing: serializeSharing(architecture) })
  }

  /** RM-24: everyone who entered the old code loses access. */
  async regenerateCode({ params, auth, response }: HttpContext) {
    const architecture = await findOwnedArchitecture(params.id, auth.getUserOrFail())
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)

    if (!(await regenerateAccessCode(architecture))) {
      return response.conflict({ error: { message: NOT_PROTECTED_MESSAGE } })
    }

    return response.ok({ sharing: serializeSharing(architecture) })
  }
}
