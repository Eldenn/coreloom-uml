import vine from '@vinejs/vine'
import {
  API_TOKEN_ABILITIES,
  API_TOKEN_MAX_EXPIRY_DAYS,
  API_TOKEN_NAME_MAX_LENGTH,
} from '#app/api-tokens/constants/api-token'

/**
 * `POST /account/api-tokens` — a named token with at least one ability.
 * `expiresInDays: null` makes a token that never expires.
 */
export const createApiTokenInput = vine.create(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(API_TOKEN_NAME_MAX_LENGTH),
    abilities: vine.array(vine.enum(API_TOKEN_ABILITIES)).minLength(1).distinct(),
    expiresInDays: vine.number().withoutDecimals().range([1, API_TOKEN_MAX_EXPIRY_DAYS]).nullable(),
  }),
)
