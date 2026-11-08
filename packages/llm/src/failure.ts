import { APICallError } from 'ai'

/**
 * Why a call to the provider failed, as the API reports it. Nothing else of the error (message,
 * body, headers, request) ever leaves this module: it may echo the key or the prompt.
 */
export const LlmFailureReason = {
  Unauthorized: 'unauthorized',
  ModelNotFound: 'model_not_found',
  Unreachable: 'unreachable',
  Timeout: 'timeout',
  RateLimited: 'rate_limited',
  Unknown: 'unknown',
} as const
export type LlmFailureReason = (typeof LlmFailureReason)[keyof typeof LlmFailureReason]
export const LLM_FAILURE_REASONS = Object.values(LlmFailureReason)

const MAX_DEPTH = 5

/** Reduces any error thrown by a model call to a reason. */
export function failureReason(error: unknown, depth = 0): LlmFailureReason {
  if (depth > MAX_DEPTH || error === null || typeof error !== 'object') {
    return LlmFailureReason.Unknown
  }
  if (APICallError.isInstance(error)) {
    const status = error.statusCode
    if (status === 401 || status === 403) return LlmFailureReason.Unauthorized
    if (status === 404) return LlmFailureReason.ModelNotFound
    if (status === 429) return LlmFailureReason.RateLimited
    if (status === undefined) return causeReason(error, depth) ?? LlmFailureReason.Unreachable
    return LlmFailureReason.Unknown
  }
  const name = (error as { name?: unknown }).name
  if (name === 'TimeoutError' || name === 'AbortError') return LlmFailureReason.Timeout
  // A retry wrapper: what counts is the last attempt.
  if ('lastError' in error) return failureReason(error.lastError, depth + 1)
  if (error instanceof TypeError) return LlmFailureReason.Unreachable
  return causeReason(error, depth) ?? LlmFailureReason.Unknown
}

function causeReason(error: object, depth: number): LlmFailureReason | null {
  if (!('cause' in error) || !error.cause) return null
  const reason = failureReason(error.cause, depth + 1)
  return reason === LlmFailureReason.Unknown ? null : reason
}

/** A model call that failed, reduced to its reason. Safe to log, report and answer with. */
export class LlmCallError extends Error {
  readonly reason: LlmFailureReason

  constructor(reason: LlmFailureReason) {
    super(`The LLM provider call failed: ${reason}`)
    this.name = 'LlmCallError'
    this.reason = reason
  }
}
