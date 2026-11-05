import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Guards a route behind a verified email address. Must run *after*
 * `middleware.auth()` — it reads the already-authenticated user.
 *
 * Nothing in the MVP is gated behind email verification yet; this exists so
 * a feature that needs it can add `.use(middleware.verified())` to its route
 * without reinventing the check. The SPA can branch on the stable
 * `E_EMAIL_NOT_VERIFIED` code to show a "verify your email" prompt.
 *
 * @example
 * router
 *   .get('/reports', [ReportsController])
 *   .use(middleware.auth())
 *   .use(middleware.verified())
 */
export default class VerifiedMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.getUserOrFail()

    if (!user.emailVerifiedAt) {
      return ctx.response.forbidden({
        error: {
          message: 'Verify your email address to access this resource.',
          code: 'E_EMAIL_NOT_VERIFIED',
        },
      })
    }

    return next()
  }
}
