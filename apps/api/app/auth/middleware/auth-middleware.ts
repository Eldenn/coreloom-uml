import type { Authenticators } from '@adonisjs/auth/types'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Auth middleware guards routes behind an authenticated session. Responds
 * with a 401 JSON error for API requests (the SPA always sends
 * `Accept: application/json`); `redirectTo` only applies to requests that
 * don't accept JSON.
 */
export default class AuthMiddleware {
  redirectTo = '/login'

  async handle(
    ctx: HttpContext,
    next: NextFn,
    options: { guards?: (keyof Authenticators)[] } = {},
  ) {
    await ctx.auth.authenticateUsing(options.guards, { loginRoute: this.redirectTo })
    return next()
  }
}
