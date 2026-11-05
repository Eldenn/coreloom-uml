/**
 * Purpose strings bound to encrypted tokens (`encryption.encrypt`/`.decrypt`).
 * Binding a purpose prevents a token minted for one flow (e.g. email
 * verification) from being replayed against another (e.g. password reset).
 */
export const TokenPurpose = {
  PasswordReset: 'password-reset',
  EmailVerification: 'email-verification',
} as const
