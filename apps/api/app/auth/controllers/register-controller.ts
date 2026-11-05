import type { HttpContext } from '@adonisjs/core/http'
import mail from '@adonisjs/mail/services/main'
import VerifyEmailMail from '#app/auth/mails/verify-email-mail'
import { isRegistrationEnabled } from '#app/auth/services/default-account'
import { createEmailVerificationToken } from '#app/auth/services/email-token'
import { registerInput } from '#app/auth/validators/auth-input'
import { PgErrorCode } from '#app/shared/database/pg-error'
import User from '#app/users/models/user'
import { serializeUser } from '#app/users/serializers/user-serializer'
import env from '#start/env'

export default class RegisterController {
  async handle({ request, auth, response }: HttpContext) {
    // Sign-up is closed unless REGISTRATION_ENABLED=true: the route then reads
    // as if it didn't exist.
    if (!isRegistrationEnabled()) {
      return response.notFound({ error: { message: 'Registration is disabled' } })
    }

    const { email, password, fullName } = await request.validateUsing(registerInput)

    let user: User
    try {
      user = await User.create({ email, password, fullName: fullName ?? null })
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === PgErrorCode.UniqueViolation) {
        return response.conflict({
          error: { message: 'An account with this email already exists' },
        })
      }
      throw error
    }

    await auth.use('web').login(user)

    const token = createEmailVerificationToken(user)
    const verifyUrl = `${env.get('FRONTEND_URL')}/verify-email?token=${encodeURIComponent(token)}`
    await mail.sendLater(new VerifyEmailMail(user.email, verifyUrl))

    return response.created({ user: serializeUser(user) })
  }
}
