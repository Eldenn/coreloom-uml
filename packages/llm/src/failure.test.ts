import { APICallError } from 'ai'
import { describe, expect, it } from 'vitest'
import { failureReason, LlmCallError } from './failure.ts'

function apiError(statusCode?: number, cause?: unknown) {
  return new APICallError({
    message: 'failed',
    url: 'https://api.example.com/v1/chat',
    requestBodyValues: {},
    statusCode,
    cause,
  })
}

describe('failureReason', () => {
  it('maps the status of an API call error', () => {
    expect(failureReason(apiError(401))).toBe('unauthorized')
    expect(failureReason(apiError(403))).toBe('unauthorized')
    expect(failureReason(apiError(404))).toBe('model_not_found')
    expect(failureReason(apiError(429))).toBe('rate_limited')
    expect(failureReason(apiError(500))).toBe('unknown')
  })

  it('reads a network failure as unreachable', () => {
    expect(failureReason(new TypeError('fetch failed'))).toBe('unreachable')
    expect(failureReason(apiError(undefined, new TypeError('fetch failed')))).toBe('unreachable')
  })

  it('reads an aborted or timed-out call as a timeout', () => {
    expect(failureReason(new DOMException('The operation timed out.', 'TimeoutError'))).toBe(
      'timeout',
    )
    expect(failureReason(new DOMException('aborted', 'AbortError'))).toBe('timeout')
  })

  it('looks through retry wrappers and causes', () => {
    expect(failureReason({ name: 'AI_RetryError', lastError: apiError(429) })).toBe('rate_limited')
    expect(failureReason(new Error('wrapped', { cause: apiError(401) }))).toBe('unauthorized')
  })

  it('falls back to unknown', () => {
    expect(failureReason(new Error('boom'))).toBe('unknown')
    expect(failureReason('boom')).toBe('unknown')
    expect(failureReason(null)).toBe('unknown')
  })

  it('keeps the reason of a call already reduced, even inside a wrapper', () => {
    const error = new LlmCallError('subscription_expired')
    expect(failureReason(error)).toBe('subscription_expired')
    expect(failureReason(new Error('wrapped', { cause: error }))).toBe('subscription_expired')
  })
})
