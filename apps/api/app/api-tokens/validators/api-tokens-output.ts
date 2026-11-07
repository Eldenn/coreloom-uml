import type { ApiTokenAbility } from '#app/api-tokens/constants/api-token'

/** JSON shape of an API token. The secret itself is never part of it. */
export type ApiTokenOutput = {
  id: number
  name: string
  /** Start of the token, in clear (`clu_`). */
  prefix: string
  /** Last characters of the token, in clear. */
  hint: string
  abilities: ApiTokenAbility[]
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
}

/** Shape returned by `GET /account/api-tokens`. */
export type ApiTokensListOutput = { data: ApiTokenOutput[] }

/** Shape returned by `POST /account/api-tokens`: the secret is shown this once. */
export type CreatedApiTokenOutput = { token: ApiTokenOutput; secret: string }
