import { generateText, type LanguageModel } from 'ai'
import { failureReason, type LlmFailureReason } from './failure.ts'

export const CONNECTION_TEST_PROMPT = 'Reply with OK.'
export const CONNECTION_TEST_MAX_OUTPUT_TOKENS = 5
export const CONNECTION_TEST_TIMEOUT_MS = 15_000

export type ConnectionTestResult =
  | { ok: true; latencyMs: number }
  | { ok: false; reason: LlmFailureReason }

/** One tiny call: whether the key, the model and the server answer, and how fast. */
export async function testConnection(
  model: LanguageModel,
  options: { timeoutMs?: number } = {},
): Promise<ConnectionTestResult> {
  const started = performance.now()
  try {
    await generateText({
      model,
      prompt: CONNECTION_TEST_PROMPT,
      maxOutputTokens: CONNECTION_TEST_MAX_OUTPUT_TOKENS,
      timeout: options.timeoutMs ?? CONNECTION_TEST_TIMEOUT_MS,
      maxRetries: 0,
      telemetry: { isEnabled: false },
    })
    return { ok: true, latencyMs: Math.round(performance.now() - started) }
  } catch (error) {
    return { ok: false, reason: failureReason(error) }
  }
}
