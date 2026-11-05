import type { HttpContext } from '@adonisjs/core/http'
import mail from '@adonisjs/mail/services/main'
import PasswordResetMail from '#app/auth/mails/password-reset-mail'
import { isDefaultAccount } from '#app/auth/services/default-account'
import { createPasswordResetToken } from '#app/auth/services/email-token'
import { forgotPasswordInput } from '#app/auth/validators/auth-input'
import User from '#app/users/models/user'
import env from '#start/env'

export default class ForgotPasswordController {
  async handle({ request, response }: HttpContext) {
    const { email } = await request.validateUsing(forgotPasswordInput)

    const user = await User.findBy('email', email)
    // The default account's password comes from the environment: no reset link.
    if (user && !isDefaultAccount(user)) {
      const token = createPasswordResetToken(user)
      const resetUrl = `${env.get('FRONTEND_URL')}/reset-password?token=${encodeURIComponent(token)}`
      await mail.sendLater(new PasswordResetMail(user.email, resetUrl))
    }

    // Always the same response, whether or not the email is registered —
    // otherwise this endpoint leaks which emails have an account.
    return response.ok({
      message: 'If an account exists for that email, a reset link has been sent.',
    })
  }
}
