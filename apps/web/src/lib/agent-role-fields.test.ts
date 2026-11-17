import { describe, expect, it } from 'vitest'

import { presetRank, slugify, splitLines, toggleRight } from '@/lib/agent-role-fields'

describe('toggleRight', () => {
  it('adds what a ticked right needs', () => {
    expect(toggleRight(['read'], 'push', true)).toEqual(['read', 'run-checks', 'commit', 'push'])
    expect(toggleRight(['read'], 'shell', true)).toEqual(['read', 'run-checks', 'shell'])
  })

  it('drops what needed an unticked right, and only that', () => {
    expect(
      toggleRight(['read', 'write', 'run-checks', 'shell', 'commit', 'push'], 'run-checks', false),
    ).toEqual(['read', 'write'])
    expect(toggleRight(['read', 'run-checks', 'commit', 'push'], 'commit', false)).toEqual([
      'read',
      'run-checks',
    ])
  })

  it('always keeps read', () => {
    expect(toggleRight(['read', 'write'], 'read', false)).toEqual(['read', 'write'])
    expect(toggleRight([], 'network', true)).toEqual(['read', 'network'])
  })

  it('keeps the catalog order', () => {
    expect(toggleRight(['read', 'network'], 'write', true)).toEqual(['read', 'write', 'network'])
  })
})

describe('slugify', () => {
  it('turns a name into a role identifier', () => {
    expect(slugify('Backend Architect')).toBe('backend-architect')
    expect(slugify('  Révision — API & UI ')).toBe('revision-api-ui')
    expect(slugify('***')).toBe('')
  })

  it('stays within 64 characters without a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(63)} b`)
    expect(slug).toBe('a'.repeat(63))
  })
})

describe('splitLines', () => {
  it('keeps the non-blank lines, trimmed', () => {
    expect(splitLines(' pnpm test \n\n  pnpm lint\r\n')).toEqual(['pnpm test', 'pnpm lint'])
  })
})

describe('presetRank', () => {
  it('puts name matches before description matches and hides the rest', () => {
    expect(presetRank('Security Engineer security-engineer', 'security')).toBe(2)
    expect(
      presetRank('Code Reviewer code-reviewer', 'security', ['Correctness and security']),
    ).toBe(1)
    expect(presetRank('Data Engineer data-engineer', 'security', ['Pipelines'])).toBe(0)
  })

  it('needs every word, in any order', () => {
    expect(presetRank('Backend Architect backend-architect', 'architect back')).toBe(2)
    expect(presetRank('Backend Architect backend-architect', 'backend mobile')).toBe(0)
  })
})
