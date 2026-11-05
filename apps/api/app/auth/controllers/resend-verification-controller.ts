import type { HttpContext } from '@adonisjs/core/http'
import mail from '@adonisjs/mail/services/main'
import VerifyEmailMail from '#app/auth/mails/verify-email-mail'
import { createEmailVerificationToken } from '#app/auth/services/email-token'
import env from '#start/env'

export default class ResendVerificationController {
  async handle({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()

    if (user.emailVerifiedAt) {
      return response.ok({ message: 'Your email is already verified.' })
    }

    const token = createEmailVerificationToken(user)
    const verifyUrl = `${env.get('FRONTEND_URL')}/verify-email?token=${encodeURIComponent(token)}`
    await mail.sendLater(new VerifyEmailMail(user.email, verifyUrl))

    return response.ok({ message: 'Verification email sent.' })
  }
}
