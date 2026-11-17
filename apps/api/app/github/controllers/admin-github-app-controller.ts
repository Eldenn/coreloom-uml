import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import { CODE_MAPS_NOT_FOUND, codeMapsEnabled } from '#app/code-maps/services/code-maps-flag'
import { GithubFailure } from '#app/github/constants/github'
import {
  GITHUB_DENIED,
  GITHUB_STATE_REFUSED,
  GITHUB_UNREACHABLE,
} from '#app/github/controllers/github-connection-controller'
import GithubApi from '#app/github/services/github-api'
import {
  appPageUrl,
  appSettingsUrl,
  environmentConfig,
  type GithubAppConfig,
  githubAppConfig,
} from '#app/github/services/github-app-config'
import {
  buildManifest,
  createManifestState,
  githubWebhookUrl,
  manifestPageUrl,
  reachable,
  readManifestState,
  removeRegistration,
  saveRegistration,
} from '#app/github/services/github-app-manifest'
import { completeGithubAppInput, startGithubAppInput } from '#app/github/validators/github-input'
import type {
  GithubAppManifestOutput,
  GithubAppOutput,
  GithubAppStatusOutput,
} from '#app/github/validators/github-output'
import env from '#start/env'

export const GITHUB_APP_SET = {
  error: { message: 'This server already has a GitHub App. Remove it first.' },
} as const
export const GITHUB_APP_FROM_ENVIRONMENT = {
  error: {
    message: 'The GitHub App is set by the environment variables: change it there.',
  },
} as const
export const GITHUB_APP_NONE = {
  error: { message: 'No GitHub App was created in the settings.' },
} as const

/**
 * The server's GitHub App, for the admin (`middleware.admin()`, behind the `code-maps` flag):
 * create it on GitHub from a manifest, see it, remove it. The environment's App, when its six
 * variables are set, wins and cannot be changed here. No secret is ever answered.
 */
export default class AdminGithubAppController {
  /** `GET /admin/github-app` */
  async show({ auth, request, response }: HttpContext) {
    if (!(await codeMapsEnabled(auth.getUserOrFail())))
      return response.notFound(CODE_MAPS_NOT_FOUND)
    return response.ok(await status(apiUrl(request)))
  }

  /**
   * `POST /admin/github-app/manifest` `{ organization?, public? }`: the manifest, and GitHub's
   * page the browser posts it to.
   */
  async start({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const blocked = await creationBlocked()
    if (blocked) return response.conflict(blocked)
    const input = await request.validateUsing(startGithubAppInput)
    const output: GithubAppManifestOutput = {
      url: manifestPageUrl(createManifestState(user), input.organization || undefined),
      manifest: buildManifest({ apiUrl: apiUrl(request), public: input.public ?? false }),
    }
    return response.ok(output)
  }

  /** `POST /admin/github-app` `{ code, state }`: GitHub's answer once the App is created. */
  async store({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const { code, state } = await request.validateUsing(completeGithubAppInput)
    if (!readManifestState(state, user)) return response.unprocessableEntity(GITHUB_STATE_REFUSED)
    const blocked = await creationBlocked()
    if (blocked) return response.conflict(blocked)

    const github = await app.container.make(GithubApi)
    const created = await github.convertManifest(code)
    if (!created.ok) {
      return created.failure === GithubFailure.Unreachable
        ? response.badGateway(GITHUB_UNREACHABLE)
        : response.unprocessableEntity(GITHUB_DENIED)
    }
    await saveRegistration(created.value, user)
    return response.ok(await status(apiUrl(request)))
  }

  /**
   * `DELETE /admin/github-app`: forgets the App created here, and every user's repositories
   * read through it. It stays on GitHub until deleted there (`settingsUrl`).
   */
  async destroy({ auth, response }: HttpContext) {
    if (!(await codeMapsEnabled(auth.getUserOrFail())))
      return response.notFound(CODE_MAPS_NOT_FOUND)
    if (environmentConfig()) return response.conflict(GITHUB_APP_FROM_ENVIRONMENT)
    if (!(await githubAppConfig())) return response.notFound(GITHUB_APP_NONE)
    await removeRegistration()
    return response.noContent()
  }
}

async function creationBlocked() {
  if (environmentConfig()) return GITHUB_APP_FROM_ENVIRONMENT
  if (await githubAppConfig()) return GITHUB_APP_SET
  return null
}

/**
 * The API's public address: `API_URL` when set (behind a proxy, the request may not say it),
 * otherwise the request's own.
 */
function apiUrl(request: HttpContext['request']): string {
  const configured = env.get('API_URL')?.trim()
  if (configured) return configured
  return `${request.protocol()}://${request.host() ?? 'localhost'}`
}

async function status(api: string): Promise<GithubAppStatusOutput> {
  const config = await githubAppConfig()
  const webhookUrl = githubWebhookUrl(api)
  return {
    source: config?.source ?? null,
    app: config ? serializeApp(config) : null,
    webhookUrl,
    webhookReachable: reachable(webhookUrl),
  }
}

function serializeApp(config: GithubAppConfig): GithubAppOutput {
  return {
    appId: Number(config.appId),
    slug: config.slug,
    name: config.name,
    owner: config.owner,
    pageUrl: appPageUrl(config.slug),
    settingsUrl: appSettingsUrl(config.slug, config.owner),
    webhook: config.webhookSecret !== null,
  }
}
