import type { CodexAttemptStatus } from '#app/llm-connections/constants/llm-connections'

/** `POST /llm/connections/openai-codex/attempts`: what the user needs to sign in. */
export type CodexAttemptOutput = {
  attemptId: string
  /** The page where the user types `userCode`. */
  verificationUrl: string
  userCode: string
  /** Seconds to wait between two polls. */
  interval: number
  expiresAt: string
}

/** `GET /llm/connections/openai-codex/attempts/:attemptId`. */
export type CodexAttemptStatusOutput = { status: CodexAttemptStatus }
