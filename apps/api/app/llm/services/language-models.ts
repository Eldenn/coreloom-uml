import {
  baseUrlProblem,
  createLanguageModel,
  type LanguageModel,
  LlmFailureReason,
  type ProviderSettings,
  requiresApiKey,
} from '@coreloom-uml/llm'
import type { LlmFailureOutput } from '#app/llm/validators/llm-output'
import llmConfig from '#config/llm'

/**
 * Builds the model a request calls. Resolved from the container, so tests swap it for the AI
 * SDK's mock model (`app.container.swap(LanguageModels, ...)`) and never reach a provider.
 */
export default class LanguageModels {
  create(provider: ProviderSettings, apiKey: string): LanguageModel {
    return createLanguageModel(provider, apiKey)
  }
}

/**
 * Why this provider cannot be called, or `null`: a hosted provider needs a key, and a base URL
 * must be allowlisted (`LLM_ALLOWED_BASE_URLS`) where one is taken and absent elsewhere.
 */
export function providerProblem(provider: ProviderSettings, apiKey: string): string | null {
  if (requiresApiKey(provider.kind) && !apiKey) return `A ${provider.kind} provider needs a key`
  return baseUrlProblem(provider, llmConfig.allowedOrigins)
}

/** The 502 body of a failed provider call. */
export function llmFailure(reason: LlmFailureReason): LlmFailureOutput {
  return { error: { message: `The LLM provider call failed (${reason})` }, reason }
}

export { LlmFailureReason }
