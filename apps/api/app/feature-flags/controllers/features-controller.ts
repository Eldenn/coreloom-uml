import type { HttpContext } from '@adonisjs/core/http'
import { evaluateAll } from '#app/feature-flags/services/feature-flags'
import type { FeaturesOutput } from '#app/feature-flags/validators/feature-flags-output'

/** `GET /features`: which flags are on for the caller, so the web app shows what they can use. */
export default class FeaturesController {
  async index({ auth, response }: HttpContext) {
    const output: FeaturesOutput = { flags: await evaluateAll(auth.getUserOrFail()) }
    return response.ok(output)
  }
}
