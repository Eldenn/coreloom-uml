import { describe, expect, it } from 'vitest'

import { callBody, parseStoredProvider } from './llm-provider-body'

describe('parseStoredProvider', () => {
  it('reads a subscription provider without a key', () => {
    expect(parseStoredProvider('{"kind":"openai-codex","model":"gpt-5.5"}')).toEqual({
      kind: 'openai-codex',
      model: 'gpt-5.5',
    })
  })

  it('keeps the key and base URL of a key provider', () => {
    expect(
      parseStoredProvider('{"kind":"ollama","model":"qwen3","baseUrl":"http://x","apiKey":"k"}'),
    ).toEqual({ kind: 'ollama', model: 'qwen3', baseUrl: 'http://x', apiKey: 'k' })
  })

  it('ignores what it cannot read', () => {
    expect(parseStoredProvider('not json')).toBeNull()
    expect(parseStoredProvider('{"kind":1}')).toBeNull()
    expect(parseStoredProvider(null)).toBeNull()
  })
})

describe('callBody', () => {
  it('sends no key for a subscription', () => {
    expect(callBody({ kind: 'claude-code', model: 'sonnet' })).toEqual({
      provider: { kind: 'claude-code', model: 'sonnet', baseUrl: null },
      apiKey: null,
    })
  })
})
