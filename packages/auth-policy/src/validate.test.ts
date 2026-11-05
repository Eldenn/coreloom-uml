import { describe, expect, it } from 'vitest'
import { describePolicy } from './describe.js'
import { validatePassword } from './validate.js'

describe('validatePassword', () => {
  it('passes a strong password', () => {
    expect(validatePassword('Wm9!qpXz74te')).toEqual([])
  })

  it('flags too-short passwords (boundary 11 vs 12)', () => {
    expect(validatePassword('Wm9!qpXz74t')).toContain('min-length') // 11 chars
    expect(validatePassword('Wm9!qpXz74te')).not.toContain('min-length') // 12 chars
  })

  it('requires at least two character types', () => {
    expect(validatePassword('abcdefghijkl')).toContain('character-types') // one type
    expect(validatePassword('abcdefghij1l')).not.toContain('character-types') // two types
  })

  it('rejects repeated or sequential runs', () => {
    expect(validatePassword('aaa!Qbcd1234')).toContain('repetition') // aaa + 1234
    expect(validatePassword('Wm9!qpXz74te')).not.toContain('repetition')
  })

  it('rejects passwords derived from email or name', () => {
    expect(validatePassword('matthieuXY99!', { email: 'matthieu@x.io' })).toContain('user-info')
    expect(validatePassword('Wm9!qpXz74te', { email: 'matthieu@x.io' })).not.toContain('user-info')
    expect(validatePassword('Wm9!qpXz74te', { name: 'Wm9 stuff' })).not.toContain('user-info')
  })

  it('returns multiple codes at once', () => {
    expect(validatePassword('aaa').sort()).toEqual(
      ['character-types', 'min-length', 'repetition'].sort(),
    )
  })
})

describe('describePolicy', () => {
  it('describes every local rule with the canonical numbers', () => {
    const items = describePolicy()
    expect(items.map((i) => i.code)).toEqual([
      'min-length',
      'character-types',
      'repetition',
      'user-info',
    ])
    expect(items[0]?.label).toContain('12')
    expect(items[1]?.label).toContain('2')
  })
})
