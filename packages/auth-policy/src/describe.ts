import { PASSWORD_POLICY } from './policy.js'
import type { PasswordRuleCode } from './validate.js'

export interface PasswordRequirement {
  code: PasswordRuleCode
  label: string
}

// Human-readable requirements for the locally-checkable rules, in the order
// they should be shown. Labels embed the canonical numbers so UI never repeats
// the policy values.
export function describePolicy(): PasswordRequirement[] {
  return [
    { code: 'min-length', label: `At least ${PASSWORD_POLICY.minLength} characters` },
    {
      code: 'character-types',
      label: `At least ${PASSWORD_POLICY.minCharacterTypes} of: lowercase, uppercase, number, symbol`,
    },
    { code: 'repetition', label: 'No repeated or sequential characters (e.g. aaa, 123)' },
    { code: 'user-info', label: 'Does not contain your email or name' },
  ]
}
