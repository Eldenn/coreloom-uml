import app from '@adonisjs/core/services/app'
import {
  baseUrlProblem,
  createLanguageModel,
  type LanguageModel,
  type LlmCredential,
  LlmFailureReason,
  type ProviderSettings,
  requiresApiKey,
} from '@coreloom-uml/llm'
import type { LlmFailureOutput } from '#app/llm/validators/llm-output'
import { ProviderKind } from '#app/llm-connections/constants/llm-connections'
import ClaudeCodeCli from '#app/llm-connections/services/claude-code-cli'
import { withClaudeFolder } from '#app/llm-connections/services/claude-code-state'
import { resolveCredential } from '#app/llm-connections/services/llm-credential'
import type User from '#app/users/models/user'
import llmConfig from '#config/llm'

/** A `claude-code` model name: one token that cannot read as a flag of the binary. */
const CLAUDE_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:[\]-]*$/

/**
 * Builds the model a request calls, with a key or a connected subscription
 * (`resolveCredential`). A Claude subscription's launches each borrow a private folder holding the
 * owner's saved state (`withClaudeFolder`). Resolved from the container, so tests swap it for the
 * AI SDK's mock model (`app.container.swap(LanguageModels, ...)`) and never reach a provider.
 */
export default class LanguageModels {
  create(provider: ProviderSettings, credential: LlmCredential): LanguageModel {
    return createLanguageModel(provider, credential, {
      claudeRun: async (args, { owner, ...options }) => {
        const cli = await app.container.make(ClaudeCodeCli)
        return withClaudeFolder({ id: owner }, (configDir) =>
          cli.run(args, { ...options, configDir }),
        )
      },
    })
  }
}

/**
 * Why this provider cannot be called, or `null`: a hosted provider needs a key, and a base URL
 * must be allowlisted (`LLM_ALLOWED_BASE_URLS`) where one is taken and absent elsewhere.
 */
export function providerProblem(provider: ProviderSettings, apiKey: string): string | null {
  if (requiresApiKey(provider.kind) && !apiKey) return `A ${provider.kind} provider needs a key`
  if (provider.kind === ProviderKind.ClaudeCode && !CLAUDE_MODEL.test(provider.model)) {
    return 'A claude-code model is a single name, such as sonnet'
  }
  return baseUrlProblem(provider, llmConfig.allowedOrigins)
}

/**
 * The model a request calls with the user's provider: `problem` (422) when the settings cannot be
 * called — a kind whose key was never saved among them —, `notFound` (404) for a subscription kind
 * behind an off flag, `reason` (502) for a subscription that is not connected or whose grant
 * died.
 */
export async function userLanguageModel(
  provider: ProviderSettings,
  user: Pick<User, 'id' | 'email'>,
): Promise<
  { model: LanguageModel } | { problem: string } | { notFound: true } | { reason: LlmFailureReason }
> {
  const resolved = await resolveCredential(provider, user)
  if (!('credential' in resolved)) return resolved
  // A saved key answers with the origin it was saved with: the request's base URL is ignored for
  // it, so a stolen session cannot point the saved key at another origin.
  const effective: ProviderSettings = resolved.baseUrl
    ? { ...provider, baseUrl: resolved.baseUrl }
    : provider
  const problem = providerProblem(
    effective,
    typeof resolved.credential === 'string' ? resolved.credential : '',
  )
  if (problem) return { problem }
  return {
    model: (await app.container.make(LanguageModels)).create(effective, resolved.credential),
  }
}

/** The 502 body of a failed provider call. */
export function llmFailure(reason: LlmFailureReason): LlmFailureOutput {
  return { error: { message: `The LLM provider call failed (${reason})` }, reason }
}

export { LlmFailureReason }
