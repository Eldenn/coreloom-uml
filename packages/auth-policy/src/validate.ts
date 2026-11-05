import { PASSWORD_POLICY } from './policy.js'

export const PASSWORD_RULES = ['min-length', 'character-types', 'repetition', 'user-info'] as const
export type PasswordRuleCode = (typeof PASSWORD_RULES)[number]

export interface PasswordContext {
  email?: string
  name?: string
}

function countCharacterTypes(password: string): number {
  let types = 0
  if (/[a-z]/.test(password)) types++
  if (/[A-Z]/.test(password)) types++
  if (/[0-9]/.test(password)) types++
  if (/[^a-zA-Z0-9]/.test(password)) types++
  return types
}

// True when three consecutive characters repeat (aaa) or form an ascending or
// descending code-point run (abc / 321). Mirrors Logto's repetitionAndSequence.
function hasRepetitionOrSequence(password: string): boolean {
  for (let i = 0; i + 2 < password.length; i++) {
    const a = password.charCodeAt(i)
    const b = password.charCodeAt(i + 1)
    const c = password.charCodeAt(i + 2)
    if (a === b && b === c) return true
    if (b - a === 1 && c - b === 1) return true
    if (a - b === 1 && b - c === 1) return true
  }
  return false
}

// True when the password contains an identity token (email local-part, or a
// name word) of 4+ characters, case-insensitively. The 4-character floor avoids
// false positives from very short fragments that legitimately occur in strong
// passwords.
function matchesUserInfo(password: string, context: PasswordContext): boolean {
  const lower = password.toLowerCase()
  const tokens: string[] = []
  if (context.email) tokens.push(context.email.toLowerCase().split('@')[0] ?? '')
  if (context.name) tokens.push(...context.name.toLowerCase().split(/\s+/))
  return tokens.some((token) => token.length >= 4 && lower.includes(token))
}

// Validates the locally-checkable rules and returns the failed rule codes.
// The pwned (breached) rule is intentionally NOT checked here — only Logto
// enforces it server-side.
export function validatePassword(
  password: string,
  context: PasswordContext = {},
): PasswordRuleCode[] {
  const failed: PasswordRuleCode[] = []
  if (password.length < PASSWORD_POLICY.minLength) failed.push('min-length')
  if (countCharacterTypes(password) < PASSWORD_POLICY.minCharacterTypes) {
    failed.push('character-types')
  }
  if (PASSWORD_POLICY.rejectRepetitionAndSequence && hasRepetitionOrSequence(password)) {
    failed.push('repetition')
  }
  if (PASSWORD_POLICY.rejectUserInfo && matchesUserInfo(password, context)) {
    failed.push('user-info')
  }
  return failed
}
