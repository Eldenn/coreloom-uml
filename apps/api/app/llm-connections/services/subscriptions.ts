import { PROVIDER_KINDS, ProviderAuth, providerAuth } from '@coreloom-uml/catalog'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { isFeatureEnabled } from '#app/feature-flags/services/feature-flags'
import { ProviderKind } from '#app/llm-connections/constants/llm-connections'
import { claudeConnected } from '#app/llm-connections/services/claude-code-connections'
import { codexConnected } from '#app/llm-connections/services/codex-connections'
import type User from '#app/users/models/user'

type Person = Pick<User, 'id' | 'email'>

/** The flag behind each subscription kind: off for a user, the kind does not exist for them. */
export const SUBSCRIPTION_FLAGS = {
  [ProviderKind.OpenAICodex]: FeatureFlagKey.LlmSubscriptionChatgpt,
  [ProviderKind.ClaudeCode]: FeatureFlagKey.LlmSubscriptionClaude,
} as const satisfies Partial<Record<ProviderKind, FeatureFlagKey>>

/** Whether this user may use this kind: always for a key, per its flag for a subscription. */
export async function kindEnabled(kind: ProviderKind, user: Person): Promise<boolean> {
  if (kind === ProviderKind.OpenAICodex || kind === ProviderKind.ClaudeCode) {
    return isFeatureEnabled(SUBSCRIPTION_FLAGS[kind], user)
  }
  return true
}

/** The kinds this user may use, in the catalog's order. */
export async function enabledKinds(user: Person): Promise<ProviderKind[]> {
  const enabled = await Promise.all(PROVIDER_KINDS.map((kind) => kindEnabled(kind, user)))
  return PROVIDER_KINDS.filter((_kind, index) => enabled[index])
}

/** A key kind is always ready; a subscription once the user connected it. */
export async function kindConnected(kind: ProviderKind, user: Person): Promise<boolean> {
  if (providerAuth(kind) === ProviderAuth.ApiKey) return true
  if (kind === ProviderKind.OpenAICodex) return codexConnected(user)
  return claudeConnected(user)
}
