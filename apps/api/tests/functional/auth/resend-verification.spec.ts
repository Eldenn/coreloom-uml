import testUtils from '@adonisjs/core/services/test_utils'
import mail from '@adonisjs/mail/services/main'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import VerifyEmailMail from '#app/auth/mails/verify-email-mail'
import User from '#app/users/models/user'

test.group('Auth - resend verification', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('resends the verification email for an unverified user', async ({ client }) => {
    using fake = mail.fake()
    const user = await User.create({
      email: 'unverified@example.com',
      password: 'a-very-strong-passphrase',
    })

    const response = await client
      .post('/auth/resend-verification')
      .header('accept', 'application/json')
      .loginAs(user)

    response.assertStatus(200)
    fake.mails.assertQueued(VerifyEmailMail, ({ message }) => message.hasTo(user.email))
  })

  test('is a no-op for an already-verified user', async ({ client }) => {
    using fake = mail.fake()
    const user = await User.create({
      email: 'verified@example.com',
      password: 'a-very-strong-passphrase',
      emailVerifiedAt: DateTime.now(),
    })

    const response = await client
      .post('/auth/resend-verification')
      .header('accept', 'application/json')
      .loginAs(user)

    response.assertStatus(200)
    fake.mails.assertNotQueued(VerifyEmailMail)
  })

  test('requires an authenticated session', async ({ client }) => {
    const response = await client
      .post('/auth/resend-verification')
      .header('accept', 'application/json')

    response.assertStatus(401)
  })
})
