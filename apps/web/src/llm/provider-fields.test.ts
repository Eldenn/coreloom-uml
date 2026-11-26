import { describe, expect, it } from 'vitest'

import type { ProviderInfo } from '@/lib/llm-provider'

import { autoSaved, keyToSave, saveProblem } from './provider-fields'

const KEY = 'sk-typed-0123456789'

const info = (kind: string, rest: Partial<ProviderInfo>) =>
  ({
    kind,
    models: [],
    auth: 'key',
    connected: false,
    requiresApiKey: true,
    takesBaseUrl: false,
    keyHint: null,
    baseUrl: null,
    verifiedAt: null,
    ...rest,
  }) as ProviderInfo
const anthropic = info('anthropic', {})
const savedAnthropic = info('anthropic', { connected: true, keyHint: 'abcd' })
const ollama = info('ollama', { requiresApiKey: false, takesBaseUrl: true })
const savedOllama = info('ollama', {
  requiresApiKey: false,
  takesBaseUrl: true,
  connected: true,
  keyHint: '',
  baseUrl: 'http://saved',
})
const ollamaWithKey = info('ollama', {
  requiresApiKey: false,
  takesBaseUrl: true,
  connected: true,
  keyHint: 'wxyz',
  baseUrl: 'http://saved',
})
const claude = info('claude-code', { auth: 'subscription', requiresApiKey: false })

const fields = (kind: string, model: string, rest: { baseUrl?: string; apiKey?: string } = {}) =>
  ({ kind, model, baseUrl: rest.baseUrl ?? '', apiKey: rest.apiKey ?? '' }) as Parameters<
    typeof autoSaved
  >[0]

describe('autoSaved', () => {
  it('keeps the kind and the model of a kind the account can call, never a typed key', () => {
    expect(autoSaved(fields('anthropic', ' b ', { apiKey: KEY }), [savedAnthropic])).toEqual({
      kind: 'anthropic',
      model: 'b',
    })
  })

  it('keeps a subscription kind at once', () => {
    expect(autoSaved(fields('claude-code', 'sonnet'), [claude])).toEqual({
      kind: 'claude-code',
      model: 'sonnet',
    })
  })

  it('waits for Save while the account holds no key or server URL for the kind', () => {
    expect(autoSaved(fields('anthropic', 'b', { apiKey: KEY }), [anthropic])).toBeNull()
    expect(autoSaved(fields('ollama', 'llama', { baseUrl: 'http://typed' }), [ollama])).toBeNull()
    expect(autoSaved(fields('ollama', 'qwen'), [savedOllama])).toEqual({
      kind: 'ollama',
      model: 'qwen',
    })
  })

  it('keeps nothing without a model', () => {
    expect(autoSaved(fields('claude-code', '  '), [claude])).toBeNull()
  })
})

describe('keyToSave', () => {
  it('sends a typed key, with the server URL of a kind that takes one', () => {
    expect(keyToSave(fields('anthropic', 'm', { apiKey: ` ${KEY} ` }), savedAnthropic)).toEqual({
      kind: 'anthropic',
      apiKey: KEY,
      baseUrl: null,
    })
    expect(keyToSave(fields('ollama', 'm', { apiKey: KEY, baseUrl: 'http://x ' }), ollama)).toEqual(
      { kind: 'ollama', apiKey: KEY, baseUrl: 'http://x' },
    )
  })

  it('sends a new server URL of a server saved without a key', () => {
    expect(keyToSave(fields('ollama', 'm', { baseUrl: 'http://x' }), ollama)).toEqual({
      kind: 'ollama',
      apiKey: null,
      baseUrl: 'http://x',
    })
    expect(keyToSave(fields('ollama', 'm', { baseUrl: 'http://new' }), savedOllama)).toEqual({
      kind: 'ollama',
      apiKey: null,
      baseUrl: 'http://new',
    })
  })

  it('sends nothing when the account key stays as it is', () => {
    expect(keyToSave(fields('anthropic', 'm'), savedAnthropic)).toBeNull()
    expect(keyToSave(fields('ollama', 'm', { baseUrl: 'http://saved' }), savedOllama)).toBeNull()
    expect(keyToSave(fields('claude-code', 'm', { apiKey: KEY }), claude)).toBeNull()
  })
})

describe('saveProblem', () => {
  it('asks for a key the account does not hold yet', () => {
    expect(saveProblem(fields('anthropic', 'm'), anthropic)).toBe('apiKeyRequired')
    expect(saveProblem(fields('anthropic', 'm', { apiKey: KEY }), anthropic)).toBeNull()
    expect(saveProblem(fields('anthropic', 'm'), savedAnthropic)).toBeNull()
  })

  it('asks for the key again before a saved key moves to a new server URL', () => {
    expect(saveProblem(fields('ollama', 'm', { baseUrl: 'http://new' }), ollamaWithKey)).toBe(
      'apiKeyAgain',
    )
    expect(
      saveProblem(fields('ollama', 'm', { baseUrl: 'http://saved' }), ollamaWithKey),
    ).toBeNull()
    expect(saveProblem(fields('ollama', 'm', { baseUrl: 'http://new' }), savedOllama)).toBeNull()
  })

  it('never asks a subscription for a key', () => {
    expect(saveProblem(fields('claude-code', 'm'), claude)).toBeNull()
  })
})
