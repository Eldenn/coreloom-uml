import type User from '#app/users/models/user'

/**
 * JSON-serialized shape of a user, as sent to clients. This is the single
 * source of truth for the public user shape: the Tuyau client infers its
 * `User` type from controller responses that return `serializeUser(...)`,
 * so `DateTime` columns must be narrowed to their wire type (ISO string)
 * here rather than leaked as Luxon objects.
 */
export type UserOutput = {
  id: number
  fullName: string | null
  email: string
  emailVerifiedAt: string | null
  /**
   * Relative API path to the user's avatar bytes (`/account/avatar`), or null.
   * A stable path rather than a signed URL keeps this serializer synchronous —
   * the web client prefixes it with the API base URL. The bytes are served by
   * the authenticated `account.avatar_show` route.
   */
  avatarUrl: string | null
}

export function serializeUser(user: User): UserOutput {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt?.toISO() ?? null,
    avatarUrl: user.avatarKey ? '/account/avatar' : null,
  }
}
