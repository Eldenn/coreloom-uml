import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { isDefaultAccount } from '#app/auth/services/default-account'

/**
 * Guards a route behind the admin: the default account (`DEFAULT_ACCOUNT_EMAIL`). Must run
 * *after* `middleware.auth()`. Anyone else gets a 404, as for a resource they don't own.
 */
export default class AdminMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    if (!isDefaultAccount(ctx.auth.getUserOrFail())) {
      return ctx.response.notFound({ error: { message: 'Not found' } })
    }
    return next()
  }
}
