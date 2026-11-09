import {
  LlmCallError,
  type LlmCredential,
  LlmFailureReason,
  type ProviderSettings,
} from '@coreloom-uml/llm'
import { ProviderKind } from '#app/llm-connections/constants/llm-connections'
import { claudeConfigDir } from '#app/llm-connections/services/claude-code-connections'
import { codexCredential } from '#app/llm-connections/services/codex-connections'
import { kindEnabled } from '#app/llm-connections/services/subscriptions'
import type User from '#app/users/models/user'

export type ResolvedCredential =
  | { credential: LlmCredential }
  | { notFound: true }
  | { reason: LlmFailureReason }

/**
 * What a call with this provider authenticates with: the key from the request, or the user's
 * connected subscription. A subscription kind whose flag is off does not exist (`notFound`); one
 * that is not connected, or whose grant died, fails like a provider call (`reason`).
 */
export async function resolveCredential(
  provider: ProviderSettings,
  apiKey: string,
  user: Pick<User, 'id' | 'email'>,
): Promise<ResolvedCredential> {
  if (!(await kindEnabled(provider.kind, user))) return { notFound: true }
  if (provider.kind === ProviderKind.OpenAICodex) {
    try {
      const credential = await codexCredential(user)
      return credential ? { credential } : { reason: LlmFailureReason.SubscriptionExpired }
    } catch (error) {
      if (error instanceof LlmCallError) return { reason: error.reason }
      throw error
    }
  }
  if (provider.kind === ProviderKind.ClaudeCode) {
    return { credential: { kind: provider.kind, configDir: await claudeConfigDir(user) } }
  }
  return { credential: apiKey }
}
