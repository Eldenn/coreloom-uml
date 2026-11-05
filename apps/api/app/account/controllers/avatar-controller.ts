import { readFile } from 'node:fs/promises'
import type { HttpContext } from '@adonisjs/core/http'
import drive from '@adonisjs/drive/services/main'
import {
  AVATAR_CONTENT_TYPES,
  AVATAR_EXTENSIONS,
  AVATAR_MAX_SIZE,
  isAvatarExtension,
} from '#app/account/constants/avatar'
import { serializeUser } from '#app/users/serializers/user-serializer'

/**
 * The signed-in user's avatar. Bytes are held in @adonisjs/drive on a `private`
 * disk under `avatars/<userId>.<ext>`; `serializeUser` only ever exposes the
 * relative path `/account/avatar`, and `show` streams the object back through
 * this authenticated route. Own avatar only.
 */
export default class AvatarController {
  async show({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!user.avatarKey) {
      return response.notFound({ error: { message: 'No avatar set' } })
    }

    const ext = user.avatarKey.split('.').pop()
    const contentType =
      ext && isAvatarExtension(ext) ? AVATAR_CONTENT_TYPES[ext] : 'application/octet-stream'
    response.header('Content-Type', contentType)
    response.stream(await drive.use().getStream(user.avatarKey))
  }

  async update({ request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()

    // Validate at the boundary: extension allowlist + size cap.
    const file = request.file('avatar', {
      size: AVATAR_MAX_SIZE,
      extnames: [...AVATAR_EXTENSIONS],
    })

    if (!file) {
      return response.unprocessableEntity({ error: { message: 'An avatar file is required' } })
    }
    if (!file.isValid) {
      return response.unprocessableEntity({
        error: { message: file.errors[0]?.message ?? 'Invalid avatar file' },
      })
    }

    const ext = file.extname
    if (!ext || !isAvatarExtension(ext)) {
      return response.unprocessableEntity({
        error: { message: 'Unsupported avatar file extension' },
      })
    }
    if (!file.tmpPath) {
      return response.internalServerError({ error: { message: 'Avatar upload failed to save' } })
    }

    const key = `avatars/${user.id}.${ext}`
    const disk = drive.use()

    await disk.put(key, await readFile(file.tmpPath), {
      contentType: AVATAR_CONTENT_TYPES[ext],
    })

    // A new extension means a new key — drop the previous object.
    if (user.avatarKey && user.avatarKey !== key) {
      await disk.delete(user.avatarKey).catch(() => {})
    }

    user.avatarKey = key
    await user.save()

    return response.ok({ user: serializeUser(user) })
  }

  async destroy({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()

    if (user.avatarKey) {
      // Ignore "not found" — the row is the source of truth, not the object.
      const disk = drive.use()
      await disk.delete(user.avatarKey).catch(() => {})
      user.avatarKey = null
      await user.save()
    }

    return response.ok({ user: serializeUser(user) })
  }
}
