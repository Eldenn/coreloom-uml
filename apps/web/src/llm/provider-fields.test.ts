import { describe, expect, it } from 'vitest'

import type { ProviderInfo } from '@/lib/llm-provider'

import { autoSaved } from './provider-fields'

const info = (kind: string, rest: Partial<ProviderInfo>) =>
  ({
    kind,
    models: [],
    auth: 'key',
    requiresApiKey: true,
    takesBaseUrl: false,
    ...rest,
  }) as ProviderInfo
const providers = [
  info('anthropic', {}),
  info('ollama', { requiresApiKey: false, takesBaseUrl: true }),
  info('claude-code', { auth: 'subscription', requiresApiKey: false, connected: true }),
]
const fields = (kind: string, model: string, typed = '') =>
  ({ kind, model, baseUrl: typed, apiKey: typed }) as Parameters<typeof autoSaved>[0]

describe('autoSaved', () => {
  it('saves a new model with the key already saved for the kind, never a typed one', () => {
    const stored = { kind: 'anthropic', model: 'a', apiKey: 'sk-saved' } as const
    expect(autoSaved(fields('anthropic', ' b ', 'sk-typed'), providers, stored)).toEqual({
      kind: 'anthropic',
      model: 'b',
      apiKey: 'sk-saved',
    })
  })

  it('saves a subscription kind at once', () => {
    const stored = { kind: 'anthropic', model: 'a', apiKey: 'sk-saved' } as const
    expect(autoSaved(fields('claude-code', 'sonnet'), providers, stored)).toEqual({
      kind: 'claude-code',
      model: 'sonnet',
    })
  })

  it('waits for Save when the kind still needs a key or a server URL', () => {
    const stored = { kind: 'claude-code', model: 'sonnet' } as const
    expect(autoSaved(fields('anthropic', 'b', 'sk-typed'), providers, stored)).toBeNull()
    expect(autoSaved(fields('ollama', 'llama', 'http://typed'), providers, stored)).toBeNull()
    expect(
      autoSaved(fields('ollama', 'qwen'), providers, {
        kind: 'ollama',
        model: 'llama',
        baseUrl: 'http://saved',
      }),
    ).toEqual({ kind: 'ollama', model: 'qwen', apiKey: '', baseUrl: 'http://saved' })
  })

  it('saves nothing without a model', () => {
    expect(autoSaved(fields('claude-code', '  '), providers, null)).toBeNull()
  })
})
