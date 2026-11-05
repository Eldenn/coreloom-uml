import testUtils from '@adonisjs/core/services/test_utils'
import mail from '@adonisjs/mail/services/main'
import { test } from '@japa/runner'
import PasswordResetMail from '#app/auth/mails/password-reset-mail'
import User from '#app/users/models/user'

test.group('Auth - forgot password', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('sends a reset email for a known address', async ({ client }) => {
    using fake = mail.fake()

    await User.create({ email: 'known@example.com', password: 'a-very-strong-passphrase' })

    const response = await client
      .post('/auth/forgot-password')
      .header('accept', 'application/json')
      .json({ email: 'known@example.com' })

    response.assertStatus(200)
    fake.mails.assertQueued(PasswordResetMail, ({ message }) => message.hasTo('known@example.com'))
  })

  test('responds the same way for an unknown address, without sending mail', async ({ client }) => {
    using fake = mail.fake()

    const response = await client
      .post('/auth/forgot-password')
      .header('accept', 'application/json')
      .json({ email: 'unknown@example.com' })

    response.assertStatus(200)
    fake.mails.assertNotQueued(PasswordResetMail)
  })
})
