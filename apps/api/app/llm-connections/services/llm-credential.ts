import {
  LlmCallError,
  type LlmCredential,
  LlmFailureReason,
  type ProviderSettings,
} from '@coreloom-uml/llm'
import { ProviderKind } from '#app/llm-connections/constants/llm-connections'
import { hasClaudeState } from '#app/llm-connections/services/claude-code-state'
import { codexCredential } from '#app/llm-connections/services/codex-connections'
import { storedApiKey } from '#app/llm-connections/services/llm-api-keys'
import { kindEnabled } from '#app/llm-connections/services/subscriptions'
import type User from '#app/users/models/user'

export type ResolvedCredential =
  | { credential: LlmCredential; baseUrl: string | null }
  | { notFound: true }
  | { reason: LlmFailureReason }

/**
 * What a call with this provider authenticates with: the key this account saved for its kind, or
 * its connected subscription. A saved key answers with the origin it was saved with: the caller
 * calls the provider with that base URL, never the request's, so a stolen session cannot point a
 * saved key at another origin. A subscription kind whose flag is off does not exist (`notFound`);
 * one that is not connected, or whose grant died, fails like a provider call (`reason`). A row the
 * encrypter cannot read reads as "no key saved".
 */
export async function resolveCredential(
  provider: ProviderSettings,
  user: Pick<User, 'id' | 'email'>,
): Promise<ResolvedCredential> {
  if (!(await kindEnabled(provider.kind, user))) return { notFound: true }
  if (provider.kind === ProviderKind.OpenAICodex) {
    try {
      const credential = await codexCredential(user)
      return credential
        ? { credential, baseUrl: null }
        : { reason: LlmFailureReason.SubscriptionExpired }
    } catch (error) {
      if (error instanceof LlmCallError) return { reason: error.reason }
      throw error
    }
  }
  if (provider.kind === ProviderKind.ClaudeCode) {
    // The binary's state is lent for each launch by `LanguageModels` (`withClaudeFolder`).
    return (await hasClaudeState(user))
      ? { credential: { kind: provider.kind, owner: user.id }, baseUrl: null }
      : { reason: LlmFailureReason.SubscriptionExpired }
  }
  const stored = await storedApiKey(user, provider.kind)
  return { credential: stored?.apiKey ?? '', baseUrl: stored?.baseUrl ?? null }
}
