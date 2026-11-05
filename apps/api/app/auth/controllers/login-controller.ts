import type { HttpContext } from '@adonisjs/core/http'
import { loginInput } from '#app/auth/validators/auth-input'
import User from '#app/users/models/user'
import { serializeUser } from '#app/users/serializers/user-serializer'

export default class LoginController {
  async handle({ request, auth, response }: HttpContext) {
    const { email, password } = await request.validateUsing(loginInput)

    const user = await User.verifyCredentials(email, password)
    await auth.use('web').login(user)

    return response.ok({ user: serializeUser(user) })
  }
}
