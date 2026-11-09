import { describe, expect, it } from 'vitest'

import {
  MODEL_SUGGESTIONS,
  PROVIDER_KINDS_WITH_BASE_URL,
  ProviderAuth,
  ProviderKind,
  providerAuth,
} from './index.ts'

describe('providerAuth', () => {
  it('connects the subscription kinds and takes a key for the others', () => {
    expect(providerAuth(ProviderKind.OpenAICodex)).toBe(ProviderAuth.Subscription)
    expect(providerAuth(ProviderKind.ClaudeCode)).toBe(ProviderAuth.Subscription)
    expect(providerAuth(ProviderKind.Anthropic)).toBe(ProviderAuth.ApiKey)
    expect(providerAuth(ProviderKind.Ollama)).toBe(ProviderAuth.ApiKey)
  })

  it('gives the subscription kinds no base URL, and model suggestions', () => {
    expect(PROVIDER_KINDS_WITH_BASE_URL).not.toContain('openai-codex')
    expect(PROVIDER_KINDS_WITH_BASE_URL).not.toContain('claude-code')
    expect(MODEL_SUGGESTIONS['openai-codex'].length).toBeGreaterThan(0)
    expect(MODEL_SUGGESTIONS['claude-code']).toEqual(['sonnet', 'opus', 'haiku'])
  })
})
