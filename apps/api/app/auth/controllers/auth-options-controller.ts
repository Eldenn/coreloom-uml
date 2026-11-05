import type { HttpContext } from '@adonisjs/core/http'
import { isRegistrationEnabled } from '#app/auth/services/default-account'

/** What the sign-in screens may offer (RM-06: the sign-up link only when sign-up is open). */
export default class AuthOptionsController {
  async handle({ response }: HttpContext) {
    return response.ok({ registrationEnabled: isRegistrationEnabled() })
  }
}
