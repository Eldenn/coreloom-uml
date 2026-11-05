import { DateTime } from 'luxon'
import User from '#app/users/models/user'
import env from '#start/env'

/** Same floor as the register and reset-password inputs. */
export const DEFAULT_ACCOUNT_PASSWORD_MIN_LENGTH = 12

export type DefaultAccountConfig = {
  email: string
  password: string
  fullName: string | null
}

export const EnsureDefaultAccountResult = {
  Created: 'created',
  Updated: 'updated',
  Unchanged: 'unchanged',
} as const
export type EnsureDefaultAccountResult =
  (typeof EnsureDefaultAccountResult)[keyof typeof EnsureDefaultAccountResult]

/**
 * The default account as described by the environment, or null when the
 * variables are not set (allowed outside production, see `start/env.ts`).
 */
export function defaultAccountConfig(): DefaultAccountConfig | null {
  const email = env.get('DEFAULT_ACCOUNT_EMAIL')?.trim().toLowerCase()
  const password = env.get('DEFAULT_ACCOUNT_PASSWORD')
  if (!email || !password) return null
  return { email, password, fullName: env.get('DEFAULT_ACCOUNT_NAME')?.trim() || null }
}

/**
 * True when this user is the environment-managed default account. Its email
 * and password are owned by the environment, so the account routes refuse to
 * change them and the account cannot be deleted from the app.
 */
export function isDefaultAccount(user: Pick<User, 'email'>): boolean {
  const config = defaultAccountConfig()
  return config !== null && config.email === user.email.toLowerCase()
}

export function isRegistrationEnabled(): boolean {
  return env.get('REGISTRATION_ENABLED') ?? false
}

/**
 * Creates the default account, or brings an existing one back in line with
 * the environment (password, name, verified email). Idempotent: running it on
 * every deploy changes nothing when the environment didn't change.
 */
export async function ensureDefaultAccount(
  config: DefaultAccountConfig,
): Promise<EnsureDefaultAccountResult> {
  if (config.password.length < DEFAULT_ACCOUNT_PASSWORD_MIN_LENGTH) {
    throw new Error(
      `DEFAULT_ACCOUNT_PASSWORD must be at least ${DEFAULT_ACCOUNT_PASSWORD_MIN_LENGTH} characters long`,
    )
  }

  const existing = await User.findBy('email', config.email)
  if (!existing) {
    await User.create({
      email: config.email,
      password: config.password,
      fullName: config.fullName,
      emailVerifiedAt: DateTime.now(),
    })
    return EnsureDefaultAccountResult.Created
  }

  let changed = false
  if (!(await existing.verifyPassword(config.password))) {
    existing.password = config.password
    changed = true
  }
  if (config.fullName !== null && existing.fullName !== config.fullName) {
    existing.fullName = config.fullName
    changed = true
  }
  if (existing.emailVerifiedAt === null) {
    existing.emailVerifiedAt = DateTime.now()
    changed = true
  }

  if (!changed) return EnsureDefaultAccountResult.Unchanged
  await existing.save()
  return EnsureDefaultAccountResult.Updated
}
