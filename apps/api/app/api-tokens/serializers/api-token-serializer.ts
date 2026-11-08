import { API_TOKEN_PREFIX } from '#app/api-tokens/constants/api-token'
import type ApiToken from '#app/api-tokens/models/api-token'
import type { ApiTokenOutput } from '#app/api-tokens/validators/api-tokens-output'

export function serializeApiToken(token: ApiToken): ApiTokenOutput {
  return {
    id: token.id,
    name: token.name ?? '',
    prefix: API_TOKEN_PREFIX,
    hint: token.hint ?? '',
    abilities: token.abilities,
    createdAt: token.createdAt.toISO() ?? '',
    lastUsedAt: token.lastUsedAt?.toISO() ?? null,
    expiresAt: token.expiresAt?.toISO() ?? null,
  }
}
