import type { HttpContext } from '@adonisjs/core/http'
import { assertOwner } from '#app/shared/authorization/assert-owner'
import User from '#app/users/models/user'
import { serializeUser } from '#app/users/serializers/user-serializer'

export default class UsersController {
  /**
   * Self-service only for the MVP: a user may read their own record. Ownership
   * is enforced with the shared `assertOwner` helper (see
   * `app/shared/authorization/`) — a record that isn't yours reads as a 404,
   * not a 403. No roles/policy layer yet — see the "Differences from coreloom"
   * section in the README for how to reintroduce one (e.g. `@adonisjs/bouncer`).
   */
  async show({ params, auth, response }: HttpContext) {
    const target = await User.find(params.id)
    const currentUser = auth.getUserOrFail()

    if (!target || !assertOwner({ userId: target.id }, currentUser)) {
      return response.notFound({ error: { message: 'User not found' } })
    }

    return response.ok({ user: serializeUser(target) })
  }
}
