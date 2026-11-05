import testUtils from '@adonisjs/core/services/test_utils'
import mail from '@adonisjs/mail/services/main'
import { test } from '@japa/runner'
import VerifyEmailMail from '#app/auth/mails/verify-email-mail'
import env from '#start/env'

test.group('Auth - register', (group) => {
  // Sign-up is closed by default (REGISTRATION_ENABLED); these specs exercise it open.
  group.setup(() => {
    env.set('REGISTRATION_ENABLED', true)
    return () => env.set('REGISTRATION_ENABLED', false)
  })
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates an account, starts a session, and sends a verification email', async ({
    client,
  }) => {
    using fake = mail.fake()

    const response = await client.post('/auth/register').header('accept', 'application/json').json({
      email: 'ada.lovelace@example.com',
      password: 'a-very-strong-passphrase',
      fullName: 'Ada Lovelace',
    })

    response.assertStatus(201)
    response.assertBodyContains({
      user: { email: 'ada.lovelace@example.com', emailVerifiedAt: null },
    })
    fake.mails.assertQueued(VerifyEmailMail, ({ message }) =>
      message.hasTo('ada.lovelace@example.com'),
    )
  })

  test('rejects a weak password', async ({ client }) => {
    const response = await client.post('/auth/register').header('accept', 'application/json').json({
      email: 'grace.hopper@example.com',
      password: 'short',
    })

    response.assertStatus(422)
  })

  test('rejects a duplicate email', async ({ client }) => {
    using _fake = mail.fake()

    await client.post('/auth/register').header('accept', 'application/json').json({
      email: 'duplicate@example.com',
      password: 'a-very-strong-passphrase',
    })

    const response = await client.post('/auth/register').header('accept', 'application/json').json({
      email: 'duplicate@example.com',
      password: 'another-strong-passphrase',
    })

    response.assertStatus(409)
  })
})
