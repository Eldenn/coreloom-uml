import type { HttpContext } from '@adonisjs/core/http'
import mail from '@adonisjs/mail/services/main'
import { updateProfileInput } from '#app/account/validators/account-input'
import VerifyEmailMail from '#app/auth/mails/verify-email-mail'
import { createEmailVerificationToken } from '#app/auth/services/email-token'
import { PgErrorCode } from '#app/shared/database/pg-error'
import { serializeUser } from '#app/users/serializers/user-serializer'
import env from '#start/env'

export default class UpdateProfileController {
  async handle({ request, auth, response }: HttpContext) {
    const { fullName, email } = await request.validateUsing(updateProfileInput)
    const user = auth.getUserOrFail()

    if (fullName !== undefined) {
      user.fullName = fullName
    }

    // Changing the email address unverifies it: the new address has to prove
    // itself before it counts. Also invalidates any outstanding password-reset
    // link (they are pinned to `updatedAt`), which is the safe direction.
    const emailChanged = email !== undefined && email !== user.email
    if (emailChanged) {
      user.email = email
      user.emailVerifiedAt = null
    }

    try {
      await user.save()
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === PgErrorCode.UniqueViolation) {
        return response.conflict({
          error: { message: 'An account with this email already exists' },
        })
      }
      throw error
    }

    if (emailChanged) {
      const token = createEmailVerificationToken(user)
      const verifyUrl = `${env.get('FRONTEND_URL')}/verify-email?token=${encodeURIComponent(token)}`
      await mail.sendLater(new VerifyEmailMail(user.email, verifyUrl))
    }

    return response.ok({ user: serializeUser(user) })
  }
}
