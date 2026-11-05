import vine from '@vinejs/vine'

/**
 * Email addresses are matched case-insensitively (`users.email` is `citext`),
 * so every email input is lowercased before it is stored or looked up. Keep
 * this in sync with `#app/account/validators/account-input`.
 */
const emailInput = () => vine.string().trim().toLowerCase().email().maxLength(254)

export const registerInput = vine.create(
  vine.object({
    fullName: vine.string().trim().minLength(1).maxLength(255).optional(),
    email: emailInput(),
    password: vine.string().minLength(12).maxLength(512),
  }),
)

export const loginInput = vine.create(
  vine.object({
    email: emailInput(),
    password: vine.string().minLength(1).maxLength(512),
  }),
)

export const forgotPasswordInput = vine.create(
  vine.object({
    email: emailInput(),
  }),
)

export const resetPasswordInput = vine.create(
  vine.object({
    token: vine.string().minLength(1),
    password: vine.string().minLength(12).maxLength(512),
  }),
)

export const verifyEmailInput = vine.create(
  vine.object({
    token: vine.string().minLength(1),
  }),
)
