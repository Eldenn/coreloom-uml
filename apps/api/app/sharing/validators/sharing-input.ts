import vine from '@vinejs/vine'
import { ARCHITECTURE_VISIBILITIES } from '#app/architectures/constants/visibility'

/** `PUT /architectures/:id/sharing` */
export const updateSharingInput = vine.create(
  vine.object({
    visibility: vine.enum(ARCHITECTURE_VISIBILITIES),
  }),
)

/** `POST /shared/:token/unlock` — normalized before comparison (case, spaces, dashes). */
export const unlockSharedInput = vine.create(
  vine.object({
    code: vine.string().trim().minLength(1).maxLength(32),
  }),
)
