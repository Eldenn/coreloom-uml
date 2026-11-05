import testUtils from '@adonisjs/core/services/test_utils'
import mail from '@adonisjs/mail/services/main'
import { test } from '@japa/runner'
import User from '#app/users/models/user'
import env from '#start/env'

test.group('Auth - email normalization', (group) => {
  // Sign-up is closed by default (REGISTRATION_ENABLED); these specs exercise it open.
  group.setup(() => {
    env.set('REGISTRATION_ENABLED', true)
    return () => env.set('REGISTRATION_ENABLED', false)
  })
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('lowercases the email on register', async ({ client }) => {
    using _fake = mail.fake()

    const response = await client
      .post('/auth/register')
      .header('accept', 'application/json')
      .json({ email: 'Ada.Lovelace@Example.COM', password: 'a-very-strong-passphrase' })

    response.assertStatus(201)
    response.assertBodyContains({ user: { email: 'ada.lovelace@example.com' } })
  })

  test('logs in regardless of the email casing', async ({ client }) => {
    await User.create({ email: 'casing@example.com', password: 'a-very-strong-passphrase' })

    const response = await client
      .post('/auth/login')
      .header('accept', 'application/json')
      .json({ email: 'CASING@Example.com', password: 'a-very-strong-passphrase' })

    response.assertStatus(200)
  })

  test('rejects a duplicate email that differs only in casing', async ({ client }) => {
    using _fake = mail.fake()

    await client
      .post('/auth/register')
      .header('accept', 'application/json')
      .json({ email: 'dupe@example.com', password: 'a-very-strong-passphrase' })

    const response = await client
      .post('/auth/register')
      .header('accept', 'application/json')
      .json({ email: 'DUPE@EXAMPLE.COM', password: 'another-strong-passphrase' })

    response.assertStatus(409)
  })
})
