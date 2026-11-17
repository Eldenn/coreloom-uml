import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { GithubHeader } from '#app/github/constants/github'
import { GITHUB_APP_OFF } from '#app/github/controllers/github-connection-controller'
import { githubAppConfig } from '#app/github/services/github-app-config'
import { handleGithubDelivery, verifyGithubSignature } from '#app/github/services/github-webhook'

export const GITHUB_SIGNATURE_REFUSED = {
  error: { message: 'The delivery signature does not match.' },
} as const

/**
 * `POST /github/webhook`: the GitHub App's deliveries. No session: the signature, made with the
 * webhook secret over the raw body, is the only proof a delivery comes from GitHub, so it is
 * checked before anything is read. Answers quickly; the work runs on the queue.
 */
export default class GithubWebhookController {
  async handle({ request, response }: HttpContext) {
    const config = githubAppConfig()
    if (!config) return response.notFound(GITHUB_APP_OFF)
    const raw = request.raw() ?? ''
    if (!verifyGithubSignature(raw, request.header(GithubHeader.Signature), config.webhookSecret))
      return response.unauthorized(GITHUB_SIGNATURE_REFUSED)

    const body: unknown = request.body()
    const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
    const event = request.header(GithubHeader.Event)
    const outcome = await handleGithubDelivery(event, payload)
    if (outcome !== 'ignored') {
      logger.info(
        { event, delivery: request.header(GithubHeader.Delivery), outcome },
        'GitHub delivery handled',
      )
    }
    return response.accepted({ outcome })
  }
}
