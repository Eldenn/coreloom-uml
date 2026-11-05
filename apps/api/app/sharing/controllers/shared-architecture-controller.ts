import type { HttpContext } from '@adonisjs/core/http'
import limiter from '@adonisjs/limiter/services/main'
import { ArchitectureVisibility } from '#app/architectures/constants/visibility'
import Architecture from '#app/architectures/models/architecture'
import { assertOwner } from '#app/shared/authorization/assert-owner'
import {
  ACCESS_GRANT_COOKIE,
  ACCESS_GRANT_MAX_AGE,
  SharedErrorCode,
  UNLOCK_MAX_ATTEMPTS,
  UNLOCK_WINDOW,
} from '#app/sharing/constants/sharing'
import { serializeSharedArchitecture } from '#app/sharing/serializers/sharing-serializer'
import {
  accessCodeMatches,
  accessGrantIsValid,
  createAccessGrant,
  isShared,
} from '#app/sharing/services/sharing'
import { unlockSharedInput } from '#app/sharing/validators/sharing-input'
import env from '#start/env'

const UNAVAILABLE = {
  error: { code: SharedErrorCode.Unavailable, message: 'This link is no longer available.' },
} as const

const unlockLimiter = () =>
  limiter.use({
    requests: UNLOCK_MAX_ATTEMPTS,
    duration: UNLOCK_WINDOW,
    blockDuration: UNLOCK_WINDOW,
  })

async function findShared(token: string): Promise<Architecture | null> {
  const architecture = await Architecture.query()
    .where('shareToken', token)
    .preload('diagrams', (diagrams) => diagrams.orderBy('position', 'asc'))
    .first()
  return architecture && isShared(architecture) ? architecture : null
}

function grantCookiePath(token: string) {
  return `/shared/${token}`
}

/**
 * The visitor's side of a share link (RM-25 to RM-29). No session needed; a
 * signed-in owner opening their own link skips the code.
 */
export default class SharedArchitectureController {
  async show({ params, request, auth, response }: HttpContext) {
    // RM-28: share links stay out of search engines.
    response.header('X-Robots-Tag', 'noindex, nofollow')

    const architecture = await findShared(params.token)
    if (!architecture) return response.notFound(UNAVAILABLE)

    const viewer = (await auth.use('web').check()) ? auth.use('web').user : undefined
    const isOwner = viewer !== undefined && assertOwner(architecture, viewer)

    if (
      architecture.visibility === ArchitectureVisibility.Protected &&
      !isOwner &&
      !accessGrantIsValid(architecture, request.encryptedCookie(ACCESS_GRANT_COOKIE))
    ) {
      // The title is shown on the code screen; nothing else is.
      return response.unauthorized({
        error: { code: SharedErrorCode.CodeRequired, message: 'This link needs its access code.' },
        title: architecture.title,
      })
    }

    return response.ok({
      architecture: serializeSharedArchitecture(architecture),
      isOwner,
      // RM-29: lets the page offer "Open in the editor".
      architectureId: isOwner ? architecture.id : null,
    })
  }

  async unlock({ params, request, response }: HttpContext) {
    response.header('X-Robots-Tag', 'noindex, nofollow')

    const architecture = await findShared(params.token)
    if (!architecture || architecture.visibility !== ArchitectureVisibility.Protected) {
      return response.notFound(UNAVAILABLE)
    }

    const attempts = unlockLimiter()
    const key = `share_unlock_${params.token}_${request.ip()}`
    if (await attempts.isBlocked(key)) {
      return response.tooManyRequests({
        error: { code: SharedErrorCode.TooManyAttempts, message: 'Too many wrong codes.' },
        retryAfterSeconds: await attempts.availableIn(key),
      })
    }

    const { code } = await request.validateUsing(unlockSharedInput)
    if (!accessCodeMatches(architecture, code)) {
      const result = await attempts.increment(key)
      if (result.remaining <= 0) {
        await attempts.block(key, UNLOCK_WINDOW)
      }
      return response.unprocessableEntity({
        error: { code: SharedErrorCode.WrongCode, message: 'This code is not right.' },
        attemptsLeft: Math.max(0, result.remaining),
      })
    }

    await attempts.delete(key)
    response.encryptedCookie(ACCESS_GRANT_COOKIE, createAccessGrant(architecture), {
      path: grantCookiePath(params.token),
      maxAge: ACCESS_GRANT_MAX_AGE,
      httpOnly: true,
      secure: env.get('SESSION_COOKIE_SECURE', env.get('NODE_ENV') === 'production'),
      sameSite: env.get('SESSION_COOKIE_SAME_SITE', 'lax'),
    })

    return response.ok({ architecture: serializeSharedArchitecture(architecture) })
  }
}
