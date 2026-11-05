import type { HttpContext } from '@adonisjs/core/http'
import hash from '@adonisjs/core/services/hash'
import { changePasswordInput } from '#app/account/validators/account-input'
import { DEFAULT_ACCOUNT_MANAGED_MESSAGE } from '#app/auth/constants/default-account'
import { isDefaultAccount } from '#app/auth/services/default-account'

export default class ChangePasswordController {
  async handle({ request, auth, response }: HttpContext) {
    const { currentPassword, newPassword } = await request.validateUsing(changePasswordInput)
    const user = auth.getUserOrFail()

    if (isDefaultAccount(user)) {
      return response.forbidden({ error: { message: DEFAULT_ACCOUNT_MANAGED_MESSAGE } })
    }

    if (!(await hash.verify(user.password, currentPassword))) {
      return response.badRequest({
        error: { message: 'Your current password is incorrect.' },
      })
    }

    user.password = newPassword
    await user.save()

    // Re-issue the session against the same user: a password change should
    // rotate the session id (fixation hygiene) without logging the owner out.
    await auth.use('web').login(user)

    return response.ok({ message: 'Your password has been changed.' })
  }
}
