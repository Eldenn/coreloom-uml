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

/** A Claude sign-in whose binary prints no sign-in page within this delay is stopped. */
export const CLAUDE_LOGIN_URL_TIMEOUT_MS = 30_000

/**
 * The files of the `claude` binary's configuration folder kept in the database
 * (`claude_code_states`): its credentials and its settings. Nothing else of the folder is ever
 * read back (a call runs with `--no-session-persistence`, so no transcript is written anyway).
 */
export const CLAUDE_STATE_FILES = ['.credentials.json', '.claude.json'] as const

/** The file without which the binary is not signed in: a state is never saved without it. */
export const CLAUDE_CREDENTIALS_FILE = '.credentials.json'

/** A kept file larger than this is left out of the saved state (the binary rewrites it). */
export const CLAUDE_STATE_FILE_MAX_BYTES = 512_000

/**
 * The launches of the binary for one account run one at a time: each may refresh the account's
 * tokens and write them back, and two writing at once could keep a refresh token already spent.
 * A launch waits this long for the one before it, then fails as a timeout.
 */
export const CLAUDE_LOCK_WAIT_MS = 150_000
/** The lock ends by itself after this, so a process that dies mid-launch never locks an account. */
export const CLAUDE_LOCK_TTL_MS = 180_000
/** How often a launch waiting for the lock asks for it again. */
export const CLAUDE_LOCK_RETRY_MS = 100

/**
 * The purposes the `llmKeys` encrypter binds its ciphertexts to: one per kind of stored LLM
 * secret, so a ciphertext copied to another column or table never decrypts there.
 */
export const LlmSecretPurpose = {
  ApiKey: 'llm-api-key',
  Connection: 'llm-connection',
  ClaudeState: 'claude-code-state',
} as const
export type LlmSecretPurpose = (typeof LlmSecretPurpose)[keyof typeof LlmSecretPurpose]
