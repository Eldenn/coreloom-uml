export const PASSWORD_POLICY = {
  minLength: 12,
  minCharacterTypes: 2,
  rejectPwned: true,
  rejectRepetitionAndSequence: true,
  rejectUserInfo: true,
} as const

export interface LogtoPasswordPolicy {
  length: { min: number }
  characterTypes: { min: number }
  rejects: { pwned: boolean; repetitionAndSequence: boolean; userInfo: boolean }
}

// Projects the canonical policy into the object shape Logto's Management API
// `PATCH /api/sign-in-exp` expects under `passwordPolicy`.
export function toLogtoPasswordPolicy(): LogtoPasswordPolicy {
  return {
    length: { min: PASSWORD_POLICY.minLength },
    characterTypes: { min: PASSWORD_POLICY.minCharacterTypes },
    rejects: {
      pwned: PASSWORD_POLICY.rejectPwned,
      repetitionAndSequence: PASSWORD_POLICY.rejectRepetitionAndSequence,
      userInfo: PASSWORD_POLICY.rejectUserInfo,
    },
  }
}
