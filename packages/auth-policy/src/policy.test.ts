import { describe, expect, it } from 'vitest'
import { PASSWORD_POLICY, toLogtoPasswordPolicy } from './policy.js'

describe('PASSWORD_POLICY', () => {
  it('pins the canonical values', () => {
    expect(PASSWORD_POLICY.minLength).toBe(12)
    expect(PASSWORD_POLICY.minCharacterTypes).toBe(2)
    expect(PASSWORD_POLICY.rejectPwned).toBe(true)
    expect(PASSWORD_POLICY.rejectRepetitionAndSequence).toBe(true)
    expect(PASSWORD_POLICY.rejectUserInfo).toBe(true)
  })
})

describe('toLogtoPasswordPolicy', () => {
  it('projects the policy into the Logto Management API shape', () => {
    expect(toLogtoPasswordPolicy()).toEqual({
      length: { min: 12 },
      characterTypes: { min: 2 },
      rejects: { pwned: true, repetitionAndSequence: true, userInfo: true },
    })
  })
})
