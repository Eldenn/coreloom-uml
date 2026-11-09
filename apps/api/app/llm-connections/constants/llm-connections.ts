export { ProviderKind } from '@coreloom-uml/catalog'

/** An access token is refreshed when it expires within this margin. */
export const CODEX_REFRESH_MARGIN_MS = 60_000

/** How long a device-code attempt can wait for the user (OpenAI's own limit is 15 minutes). */
export const CODEX_ATTEMPT_TTL_SECONDS = 900

/** Where a device-code attempt waits for the user. */
export const CodexAttemptStatus = {
  Pending: 'pending',
  Connected: 'connected',
  Expired: 'expired',
  Denied: 'denied',
} as const
export type CodexAttemptStatus = (typeof CodexAttemptStatus)[keyof typeof CodexAttemptStatus]

/** The answer of a subscription route while its flag is off, or of a missing attempt. */
export const SUBSCRIPTION_NOT_FOUND = { error: { message: 'Not found' } }

/** How long `claude auth status` is trusted before asking the binary again. */
export const CLAUDE_STATUS_TTL_MS = 30_000

/** A Claude sign-in left waiting for its code is stopped after this delay. */
export const CLAUDE_LOGIN_TIMEOUT_MS = 600_000
