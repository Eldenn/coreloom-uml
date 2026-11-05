import { BaseMail } from '@adonisjs/mail'

export default class VerifyEmailMail extends BaseMail {
  subject = 'Verify your email address'

  constructor(
    private email: string,
    private verifyUrl: string,
  ) {
    super()
  }

  prepare() {
    this.message.to(this.email).html(`
      <p>Welcome! Confirm your email address to finish setting up your account.</p>
      <p><a href="${this.verifyUrl}">Verify your email</a></p>
      <p>This link expires in 2 days. If you didn't create an account, you can ignore this email.</p>
    `)
  }
}
