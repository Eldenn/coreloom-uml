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
    expect(MODEL_SUGGESTIONS['claude-code'].slice(0, 4)).toEqual([
      'sonnet',
      'opus',
      'haiku',
      'fable',
    ])
  })

  it('suggests every current model of the hosted providers, each once', () => {
    expect(MODEL_SUGGESTIONS.anthropic).toContain('claude-fable-5-2')
    expect(MODEL_SUGGESTIONS.anthropic).toContain('claude-haiku-4-5-20251001')
    expect(MODEL_SUGGESTIONS['claude-code']).toContain('claude-fable-5-2')
    expect(MODEL_SUGGESTIONS.openai).toContain('gpt-6-astra')
    expect(MODEL_SUGGESTIONS.mistral).toContain('ministral-3b-2512')
    expect(MODEL_SUGGESTIONS['openai-codex']).toContain('gpt-5.3-codex-spark')
    for (const models of Object.values(MODEL_SUGGESTIONS)) {
      expect(new Set(models).size).toBe(models.length)
    }
  })
})
