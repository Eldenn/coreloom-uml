import type { HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'
import GithubCodeMapFollow from '#app/code-maps/models/github-code-map-follow'
import { CODE_MAPS_NOT_FOUND, codeMapsEnabled } from '#app/code-maps/services/code-maps-flag'
import { GithubFailure } from '#app/github/constants/github'
import GithubRepositoryGrant from '#app/github/models/github-repository-grant'
import { serializeGithubConnection } from '#app/github/serializers/github-serializer'
import GithubApi from '#app/github/services/github-api'
import { authorizeUrl, githubAppConfig, installUrl } from '#app/github/services/github-app-config'
import { listGrants, replaceGrants } from '#app/github/services/github-grants'
import { createGithubState, readGithubState } from '#app/github/services/github-state'
import {
  completeGithubConnectionInput,
  GithubConnectionTarget,
  startGithubConnectionInput,
} from '#app/github/validators/github-input'

export const GITHUB_APP_OFF = {
  error: { message: 'No GitHub App is set up on this server.' },
} as const
export const GITHUB_STATE_REFUSED = {
  error: { message: 'This GitHub connection was not started here, or it expired. Try again.' },
} as const
export const GITHUB_DENIED = {
  error: { message: 'GitHub refused the connection. Try again.' },
} as const
export const GITHUB_UNREACHABLE = {
  error: { message: 'GitHub could not be reached. Try again later.' },
} as const

/**
 * The user's connection to the GitHub App, behind the `code-maps` flag (404 while off). The user
 * installs the App on GitHub, then authorizes it; the callback sends GitHub's `code` here, which
 * is traded for a user token, used once to list the repositories the user reaches through the
 * App's installations, and revoked. Only that list is kept (`github_repository_grants`).
 */
export default class GithubConnectionController {
  /** `GET /github/connection` */
  async show({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const available = githubAppConfig() !== null
    return response.ok(
      serializeGithubConnection(available, available ? await listGrants(user.id) : []),
    )
  }

  /**
   * `POST /github/connection/start` `{ target, returnTo?, state? }`: the GitHub page to open. A
   * `state` this user started keeps its page to come back to (after an installation, GitHub
   * comes back without a `code`: the authorization follows).
   */
  async start({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const config = githubAppConfig()
    if (!config) return response.notFound(GITHUB_APP_OFF)
    const input = await request.validateUsing(startGithubConnectionInput)
    const carried = input.state ? readGithubState(input.state, user) : null
    const state = createGithubState(user, carried ?? input.returnTo)
    const url =
      input.target === GithubConnectionTarget.Install
        ? installUrl(config, state)
        : authorizeUrl(config, state)
    return response.ok({ url })
  }

  /** `POST /github/connection` `{ code, state }`: GitHub's answer, from the callback page. */
  async store({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const config = githubAppConfig()
    if (!config) return response.notFound(GITHUB_APP_OFF)
    const { code, state } = await request.validateUsing(completeGithubConnectionInput)
    const returnTo = readGithubState(state, user)
    if (!returnTo) return response.unprocessableEntity(GITHUB_STATE_REFUSED)

    const github = await app.container.make(GithubApi)
    const token = await github.exchangeCode(config, code)
    if (!token.ok) return failed(response, token.failure)
    try {
      const connection = await github.readConnection(token.value)
      if (!connection.ok) return failed(response, connection.failure)
      await replaceGrants(user, connection.value)
    } finally {
      // The server keeps no user token; a revocation that fails leaves one that expires in 8 h.
      await github.revokeUserToken(config, token.value).catch(() => undefined)
    }
    const grants = await listGrants(user.id)
    return response.ok({ ...serializeGithubConnection(true, grants), returnTo })
  }

  /**
   * `DELETE /github/connection`: forgets the user's repositories and stops every project of
   * theirs from following one. The App stays installed on GitHub until the user removes it there.
   */
  async destroy({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    await GithubCodeMapFollow.query().where('userId', user.id).delete()
    await GithubRepositoryGrant.query().where('userId', user.id).delete()
    return response.noContent()
  }
}

function failed(response: HttpContext['response'], failure: GithubFailure) {
  return failure === GithubFailure.Unreachable
    ? response.badGateway(GITHUB_UNREACHABLE)
    : response.unprocessableEntity(GITHUB_DENIED)
}
