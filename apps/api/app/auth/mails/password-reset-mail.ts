import { BaseMail } from '@adonisjs/mail'

export default class PasswordResetMail extends BaseMail {
  subject = 'Reset your password'

  constructor(
    private email: string,
    private resetUrl: string,
  ) {
    super()
  }

  prepare() {
    this.message.to(this.email).html(`
      <p>Someone requested a password reset for this account.</p>
      <p><a href="${this.resetUrl}">Reset your password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    `)
  }
}
