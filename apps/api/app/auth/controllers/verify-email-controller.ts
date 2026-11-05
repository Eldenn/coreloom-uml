import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import { verifyEmailVerificationToken } from '#app/auth/services/email-token'
import { verifyEmailInput } from '#app/auth/validators/auth-input'
import User from '#app/users/models/user'

export default class VerifyEmailController {
  async handle({ request, response }: HttpContext) {
    const { token } = await request.validateUsing(verifyEmailInput)

    const payload = verifyEmailVerificationToken(token)
    if (!payload) {
      return response.badRequest({
        error: { message: 'This verification link is invalid or has expired.' },
      })
    }

    const user = await User.findBy('email', payload.email)
    if (!user) {
      return response.badRequest({
        error: { message: 'This verification link is invalid or has expired.' },
      })
    }

    if (!user.emailVerifiedAt) {
      user.emailVerifiedAt = DateTime.now()
      await user.save()
    }

    return response.ok({ message: 'Your email address has been verified.' })
  }
}
