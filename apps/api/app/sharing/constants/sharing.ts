/** RM-22: 8 characters, upper-case letters and digits without the look-alikes 0 O 1 I L. */
export const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const ACCESS_CODE_LENGTH = 8

/** RM-20: at least 128 random bits in the link. */
export const SHARE_TOKEN_BYTES = 16

/** RM-25: attempts per link and IP, and how long the window and the block last. */
export const UNLOCK_MAX_ATTEMPTS = 5
export const UNLOCK_WINDOW = '15 mins'

/** RM-25: how long an entered code keeps a link open. */
export const ACCESS_GRANT_MAX_AGE = '24h'

/** The cookie holding an access grant; scoped to its link's path. */
export const ACCESS_GRANT_COOKIE = 'share_access'

/** Purpose bound to the encrypted access code and grant (see `TokenPurpose`). */
export const SharingPurpose = {
  AccessCode: 'share-access-code',
  AccessGrant: 'share-access-grant',
} as const

/** Path of a share link in the web app (RM-20, RM-42). */
export const SHARE_LINK_PATH = '/s'

/** Error codes the web app branches on for a share link. */
export const SharedErrorCode = {
  /** RM-27: unknown, regenerated or private link — always the same answer. */
  Unavailable: 'link_unavailable',
  /** A protected link opened without a valid grant. */
  CodeRequired: 'access_code_required',
  WrongCode: 'wrong_access_code',
  TooManyAttempts: 'too_many_attempts',
} as const
