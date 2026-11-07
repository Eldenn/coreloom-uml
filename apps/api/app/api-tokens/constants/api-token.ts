/**
 * What an API token may do on the architectures API. A request that only
 * reads (GET/HEAD) needs `read`; any other method needs `write`.
 */
export const ApiTokenAbility = {
  Read: 'read',
  Write: 'write',
} as const
export type ApiTokenAbility = (typeof ApiTokenAbility)[keyof typeof ApiTokenAbility]
export const API_TOKEN_ABILITIES = Object.values(ApiTokenAbility)

/** Shown in clear at the start of every token, so secret scanners can spot it. */
export const API_TOKEN_PREFIX = 'clu_'
/** Bucket of `auth_access_tokens` rows these tokens live in. */
export const API_TOKEN_TYPE = 'api_token'
/** Characters of the token kept in clear (`hint`) to tell tokens apart. */
export const API_TOKEN_HINT_LENGTH = 4

export const API_TOKEN_NAME_MAX_LENGTH = 100
/** Longest lifetime a token can be given; `null` means it never expires. */
export const API_TOKEN_MAX_EXPIRY_DAYS = 365
/** Tokens one account can hold at once (expired ones included until revoked). */
export const API_TOKENS_PER_USER_MAX = 20

/** Requests one token can make per minute on the architectures API. */
export const API_TOKEN_REQUESTS_PER_MINUTE = 120
