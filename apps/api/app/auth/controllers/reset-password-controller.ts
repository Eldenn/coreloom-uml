import type { HttpContext } from '@adonisjs/core/http'
import { isDefaultAccount } from '#app/auth/services/default-account'
import { verifyPasswordResetToken } from '#app/auth/services/email-token'
import { resetPasswordInput } from '#app/auth/validators/auth-input'
import User from '#app/users/models/user'

export default class ResetPasswordController {
  async handle({ request, response }: HttpContext) {
    const { token, password } = await request.validateUsing(resetPasswordInput)

    const payload = verifyPasswordResetToken(token)
    if (!payload) {
      return response.badRequest({
        error: { message: 'This reset link is invalid or has expired.' },
      })
    }

    const user = await User.findBy('email', payload.email)
    if (!user || isDefaultAccount(user) || (user.updatedAt?.toMillis() ?? 0) !== payload.v) {
      return response.badRequest({
        error: { message: 'This reset link has already been used.' },
      })
    }

    user.password = password
    await user.save()

    return response.ok({ message: 'Your password has been reset.' })
  }
}
