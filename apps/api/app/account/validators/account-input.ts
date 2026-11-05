import vine from '@vinejs/vine'

/**
 * Kept in sync with `#app/auth/validators/auth-input` — email is lowercased
 * because `users.email` is matched case-insensitively (`citext`).
 */
const emailInput = () => vine.string().trim().toLowerCase().email().maxLength(254)

/**
 * `PATCH /account` — update the current user's profile. Both fields are
 * optional; `fullName: null` explicitly clears it.
 */
export const updateProfileInput = vine.create(
  vine.object({
    fullName: vine.string().trim().minLength(1).maxLength(255).nullable().optional(),
    email: emailInput().optional(),
  }),
)

/**
 * `PUT /account/password` — change the password while signed in. Requires the
 * current password so a hijacked session can't lock the owner out.
 */
export const changePasswordInput = vine.create(
  vine.object({
    currentPassword: vine.string().minLength(1).maxLength(512),
    newPassword: vine.string().minLength(12).maxLength(512),
  }),
)

/**
 * `DELETE /account` — irreversible. Confirmed with the account password.
 */
export const deleteAccountInput = vine.create(
  vine.object({
    password: vine.string().minLength(1).maxLength(512),
  }),
)
