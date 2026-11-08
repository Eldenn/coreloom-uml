import type { HttpContext } from '@adonisjs/core/http'
import {
  API_TOKEN_HINT_LENGTH,
  API_TOKEN_TYPE,
  API_TOKENS_PER_USER_MAX,
} from '#app/api-tokens/constants/api-token'
import ApiToken from '#app/api-tokens/models/api-token'
import { serializeApiToken } from '#app/api-tokens/serializers/api-token-serializer'
import { createApiTokenInput } from '#app/api-tokens/validators/api-tokens-input'
import { assertOwner } from '#app/shared/authorization/assert-owner'
import User from '#app/users/models/user'

const API_TOKEN_NOT_FOUND = { error: { message: 'API token not found' } } as const
const SECONDS_PER_DAY = 86_400

/**
 * The signed-in user's API tokens. Reached with the session only: a token
 * cannot list, create or revoke tokens.
 */
export default class ApiTokensController {
  async index({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const tokens = await ApiToken.query()
      .where('userId', user.id)
      .where('type', API_TOKEN_TYPE)
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')

    return response.ok({ data: tokens.map(serializeApiToken) })
  }

  /** The secret is in this response only: the database keeps its hash. */
  async store({ request, auth, response }: HttpContext) {
    const { name, abilities, expiresInDays } = await request.validateUsing(createApiTokenInput)
    const user = auth.getUserOrFail()

    const count = await ApiToken.query()
      .where('userId', user.id)
      .where('type', API_TOKEN_TYPE)
      .count('* as total')
      .firstOrFail()
    if (Number(count.$extras.total) >= API_TOKENS_PER_USER_MAX) {
      return response.unprocessableEntity({
        error: { message: `An account can hold ${API_TOKENS_PER_USER_MAX} API tokens at most.` },
      })
    }

    const created = await User.accessTokens.create(user, abilities, {
      name,
      expiresIn: expiresInDays === null ? undefined : expiresInDays * SECONDS_PER_DAY,
    })
    // `value` is set on a freshly created token, and only then.
    const secret = created.value?.release() ?? ''
    const token = await ApiToken.findOrFail(created.identifier)
    token.hint = secret.slice(-API_TOKEN_HINT_LENGTH)
    await token.save()

    return response.created({ token: serializeApiToken(token), secret })
  }

  /** Revoking deletes the token: requests that carry it get 401 from then on. */
  async destroy({ params, auth, response }: HttpContext) {
    const token = await ApiToken.query()
      .where('id', params.id)
      .where('type', API_TOKEN_TYPE)
      .first()
    if (!token || !assertOwner(token, auth.getUserOrFail())) {
      return response.notFound(API_TOKEN_NOT_FOUND)
    }

    await token.delete()

    return response.noContent()
  }
}
