import { describe, expect, it } from 'vitest'

import {
  callBody,
  legacyCredential,
  legacySaveBody,
  parseStoredProvider,
} from './llm-provider-body'

const OLD_KEY = 'sk-ant-0123456789abcdef'

describe('parseStoredProvider', () => {
  it('reads the kind and the model', () => {
    expect(parseStoredProvider('{"kind":"openai-codex","model":"gpt-5.5"}')).toEqual({
      kind: 'openai-codex',
      model: 'gpt-5.5',
    })
  })

  it('never reads the key or the base URL an older entry holds', () => {
    expect(
      parseStoredProvider('{"kind":"ollama","model":"qwen3","baseUrl":"http://x","apiKey":"k"}'),
    ).toEqual({ kind: 'ollama', model: 'qwen3' })
  })

  it('ignores what it cannot read', () => {
    expect(parseStoredProvider('not json')).toBeNull()
    expect(parseStoredProvider('{"kind":1}')).toBeNull()
    expect(parseStoredProvider('null')).toBeNull()
    expect(parseStoredProvider(null)).toBeNull()
  })
})

describe('legacyCredential', () => {
  it('finds the key and the base URL of an older entry', () => {
    expect(legacyCredential(`{"kind":"anthropic","model":"m","apiKey":" ${OLD_KEY} "}`)).toEqual({
      kind: 'anthropic',
      apiKey: OLD_KEY,
      baseUrl: null,
    })
    expect(legacyCredential('{"kind":"ollama","model":"m","baseUrl":"http://x"}')).toEqual({
      kind: 'ollama',
      apiKey: '',
      baseUrl: 'http://x',
    })
  })

  it('answers null for an entry without either', () => {
    expect(legacyCredential('{"kind":"anthropic","model":"m"}')).toBeNull()
    expect(legacyCredential('{"kind":"anthropic","model":"m","apiKey":""}')).toBeNull()
    expect(legacyCredential('not json')).toBeNull()
  })
})

describe('legacySaveBody', () => {
  const providers = [
    { kind: 'anthropic', auth: 'key', connected: false, requiresApiKey: true, takesBaseUrl: false },
    { kind: 'openai', auth: 'key', connected: true, requiresApiKey: true, takesBaseUrl: false },
    { kind: 'ollama', auth: 'key', connected: false, requiresApiKey: false, takesBaseUrl: true },
    {
      kind: 'claude-code',
      auth: 'subscription',
      connected: false,
      requiresApiKey: false,
      takesBaseUrl: false,
    },
  ] as Parameters<typeof legacySaveBody>[1]

  it('offers what the account does not hold yet', () => {
    expect(
      legacySaveBody({ kind: 'anthropic', apiKey: OLD_KEY, baseUrl: 'http://stale' }, providers),
    ).toEqual({ kind: 'anthropic', apiKey: OLD_KEY, baseUrl: null })
    expect(legacySaveBody({ kind: 'ollama', apiKey: '', baseUrl: 'http://x' }, providers)).toEqual({
      kind: 'ollama',
      apiKey: null,
      baseUrl: 'http://x',
    })
  })

  it('drops what the account cannot or need not save', () => {
    const drop = (legacy: Parameters<typeof legacySaveBody>[0]) => legacySaveBody(legacy, providers)
    expect(drop({ kind: 'openai', apiKey: OLD_KEY, baseUrl: null })).toBeNull()
    expect(drop({ kind: 'claude-code', apiKey: OLD_KEY, baseUrl: null })).toBeNull()
    expect(drop({ kind: 'mistral', apiKey: OLD_KEY, baseUrl: null })).toBeNull()
    expect(drop({ kind: 'anthropic', apiKey: 'short', baseUrl: null })).toBeNull()
    expect(drop({ kind: 'anthropic', apiKey: '', baseUrl: 'http://x' })).toBeNull()
    expect(drop({ kind: 'ollama', apiKey: OLD_KEY, baseUrl: null })).toBeNull()
  })
})

describe('callBody', () => {
  it('sends the kind and the model only', () => {
    expect(callBody({ kind: 'anthropic', model: 'sonnet' })).toEqual({
      provider: { kind: 'anthropic', model: 'sonnet' },
    })
  })
})
