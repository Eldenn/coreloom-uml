import type { HttpContext } from '@adonisjs/core/http'
import { serializeUser } from '#app/users/serializers/user-serializer'

export default class MeController {
  async handle({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    return response.ok({ user: serializeUser(user) })
  }
}
