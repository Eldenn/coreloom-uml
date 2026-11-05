import type { HttpContext } from '@adonisjs/core/http'
import { ArchitectureVisibility } from '#app/architectures/constants/visibility'
import {
  ARCHITECTURE_NOT_FOUND,
  findOwnedArchitecture,
} from '#app/architectures/services/owned-architecture'
import { serializeSharing } from '#app/sharing/serializers/sharing-serializer'
import {
  applyVisibility,
  encryptAccessCode,
  generateAccessCode,
  generateShareToken,
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
    applyVisibility(architecture, visibility)
    await architecture.save()

    return response.ok({ sharing: serializeSharing(architecture) })
  }

  /** RM-21: the old link stops working at once. */
  async regenerateLink({ params, auth, response }: HttpContext) {
    const architecture = await findOwnedArchitecture(params.id, auth.getUserOrFail())
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)

    architecture.shareToken = generateShareToken()
    await architecture.save()

    return response.ok({ sharing: serializeSharing(architecture) })
  }

  /** RM-24: everyone who entered the old code loses access. */
  async regenerateCode({ params, auth, response }: HttpContext) {
    const architecture = await findOwnedArchitecture(params.id, auth.getUserOrFail())
    if (!architecture) return response.notFound(ARCHITECTURE_NOT_FOUND)

    if (architecture.visibility !== ArchitectureVisibility.Protected) {
      return response.conflict({
        error: { message: 'Only a protected architecture has an access code.' },
      })
    }

    architecture.accessCode = encryptAccessCode(generateAccessCode())
    architecture.accessVersion += 1
    await architecture.save()

    return response.ok({ sharing: serializeSharing(architecture) })
  }
}
