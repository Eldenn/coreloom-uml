import { describe, expect, it } from 'vitest'
import { baseUrlProblem, parseAllowedOrigins } from './allowlist.ts'

describe('parseAllowedOrigins', () => {
  it('reads origins separated by commas, without paths or duplicates', () => {
    expect(
      parseAllowedOrigins(
        ' http://localhost:11434/v1, https://llm.example.com ,http://localhost:11434',
      ),
    ).toEqual(['http://localhost:11434', 'https://llm.example.com'])
  })

  it('is empty by default', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([])
    expect(parseAllowedOrigins('')).toEqual([])
  })

  it('refuses an entry that is not an http(s) URL', () => {
    expect(() => parseAllowedOrigins('localhost:11434')).toThrow(/not an http\(s\) URL/)
    expect(() => parseAllowedOrigins('file:///etc/passwd')).toThrow()
  })
})

describe('baseUrlProblem', () => {
  const allowed = ['http://localhost:11434']

  it('accepts an allowlisted origin for ollama and openai-compatible', () => {
    expect(
      baseUrlProblem(
        { kind: 'ollama', model: 'qwen3', baseUrl: 'http://localhost:11434' },
        allowed,
      ),
    ).toBeNull()
    expect(
      baseUrlProblem(
        { kind: 'openai-compatible', model: 'm', baseUrl: 'http://localhost:11434/v1/' },
        allowed,
      ),
    ).toBeNull()
  })

  it('refuses an origin outside the allowlist, even on another port or scheme', () => {
    for (const baseUrl of [
      'http://localhost:11435',
      'https://localhost:11434',
      'http://169.254.169.254/latest',
      'http://127.0.0.1:11434',
    ]) {
      expect(baseUrlProblem({ kind: 'ollama', model: 'qwen3', baseUrl }, allowed)).toMatch(
        /allowlist/,
      )
    }
  })

  it('refuses everything when the allowlist is empty', () => {
    expect(
      baseUrlProblem({ kind: 'ollama', model: 'qwen3', baseUrl: 'http://localhost:11434' }, []),
    ).toMatch(/allowlist/)
  })

  it('needs a base URL for ollama and openai-compatible', () => {
    expect(baseUrlProblem({ kind: 'ollama', model: 'qwen3' }, allowed)).toMatch(/needs/)
    expect(
      baseUrlProblem({ kind: 'openai-compatible', model: 'm', baseUrl: null }, allowed),
    ).toMatch(/needs/)
  })

  it('refuses a base URL on a provider with a fixed URL', () => {
    expect(
      baseUrlProblem(
        { kind: 'mistral', model: 'mistral-small-latest', baseUrl: 'http://localhost:11434' },
        allowed,
      ),
    ).toMatch(/takes no base URL/)
    expect(baseUrlProblem({ kind: 'openai', model: 'gpt-5.5' }, allowed)).toBeNull()
  })

  it('refuses credentials, a query, a fragment or another scheme', () => {
    for (const baseUrl of [
      'http://user:pass@localhost:11434',
      'http://localhost:11434/?x=1',
      'http://localhost:11434/#x',
      'ftp://localhost:11434',
      'not a url',
    ]) {
      expect(baseUrlProblem({ kind: 'ollama', model: 'qwen3', baseUrl }, allowed)).not.toBeNull()
    }
  })
})
