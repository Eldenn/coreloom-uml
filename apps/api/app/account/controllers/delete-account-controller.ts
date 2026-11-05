import type { HttpContext } from '@adonisjs/core/http'
import hash from '@adonisjs/core/services/hash'
import { deleteAccountInput } from '#app/account/validators/account-input'
import { DEFAULT_ACCOUNT_MANAGED_MESSAGE } from '#app/auth/constants/default-account'
import { isDefaultAccount } from '#app/auth/services/default-account'

export default class DeleteAccountController {
  async handle({ request, auth, response }: HttpContext) {
    const { password } = await request.validateUsing(deleteAccountInput)
    const user = auth.getUserOrFail()

    // It would be recreated on the next deploy anyway.
    if (isDefaultAccount(user)) {
      return response.forbidden({ error: { message: DEFAULT_ACCOUNT_MANAGED_MESSAGE } })
    }

    if (!(await hash.verify(user.password, password))) {
      return response.badRequest({
        error: { message: 'Your password is incorrect.' },
      })
    }

    await auth.use('web').logout()
    await user.delete()

    return response.noContent()
  }
}
