import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { ApiTokenAbility } from '#app/api-tokens/constants/api-token'

/** Methods that only read: everything else needs the `write` ability. */
const READ_METHODS = new Set(['GET', 'HEAD'])
/** `force` values VineJS's `vine.boolean()` reads as false. */
const FALSE_VALUES = new Set<unknown>([false, 'false', 0, '0'])

/**
 * Runs after `middleware.auth({ guards: ['web', 'api'] })`. A session passes
 * through unchanged; a request made with an API token must carry the ability
 * its method needs (403 otherwise), and cannot `force` a save over someone
 * else's changes: a token always gets the 409 and must rebase on the latest
 * version.
 */
export default class TokenAbilityMiddleware {
  async handle({ auth, request, response }: HttpContext, next: NextFn) {
    if (auth.authenticatedViaGuard !== 'api') return next()

    const token = auth.use('api').getUserOrFail().currentAccessToken
    const needed = READ_METHODS.has(request.method()) ? ApiTokenAbility.Read : ApiTokenAbility.Write
    if (!token.allows(needed)) {
      return response.forbidden({
        error: { message: `This API token does not have the "${needed}" ability.` },
      })
    }

    const force = request.input('force')
    if (force !== undefined && force !== null && !FALSE_VALUES.has(force)) {
      return response.forbidden({
        error: { message: 'API tokens cannot force a save: load the latest version and retry.' },
      })
    }

    return next()
  }
}
