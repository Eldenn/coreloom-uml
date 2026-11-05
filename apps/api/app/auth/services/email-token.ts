import encryption from '@adonisjs/core/services/encryption'
import { TokenPurpose } from '#app/auth/constants/token-purpose'
import type User from '#app/users/models/user'

type EmailVerificationPayload = { email: string }
type PasswordResetPayload = { email: string; v: number }

export function createEmailVerificationToken(user: User): string {
  return encryption.encrypt({ email: user.email } satisfies EmailVerificationPayload, {
    expiresIn: '2 days',
    purpose: TokenPurpose.EmailVerification,
  })
}

export function verifyEmailVerificationToken(token: string): EmailVerificationPayload | null {
  return encryption.decrypt<EmailVerificationPayload>(token, TokenPurpose.EmailVerification)
}

/**
 * `v` pins the token to the user's `updatedAt` at mint time. Once the
 * password is actually changed, `updatedAt` moves and any older token
 * verifies to a stale `v`, making each reset link effectively single-use
 * without a dedicated tokens table.
 */
export function createPasswordResetToken(user: User): string {
  return encryption.encrypt(
    { email: user.email, v: user.updatedAt?.toMillis() ?? 0 } satisfies PasswordResetPayload,
    { expiresIn: '1 hour', purpose: TokenPurpose.PasswordReset },
  )
}

export function verifyPasswordResetToken(token: string): PasswordResetPayload | null {
  return encryption.decrypt<PasswordResetPayload>(token, TokenPurpose.PasswordReset)
}
