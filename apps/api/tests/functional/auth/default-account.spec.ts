import testUtils from '@adonisjs/core/services/test_utils'
import mail from '@adonisjs/mail/services/main'
import { test } from '@japa/runner'
import {
  defaultAccountConfig,
  EnsureDefaultAccountResult,
  ensureDefaultAccount,
} from '#app/auth/services/default-account'
import User from '#app/users/models/user'
import env from '#start/env'

const EMAIL = 'admin@example.com'
const PASSWORD = 'the-default-passphrase'

function configOrFail() {
  const config = defaultAccountConfig()
  if (!config) throw new Error('default account env is not set')
  return config
}

test.group('Auth - default account', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.setup(() => {
    env.set('DEFAULT_ACCOUNT_EMAIL', 'Admin@Example.com')
    env.set('DEFAULT_ACCOUNT_PASSWORD', PASSWORD)
    env.set('DEFAULT_ACCOUNT_NAME', 'Admin')
    return () => {
      env.set('DEFAULT_ACCOUNT_EMAIL', '')
      env.set('DEFAULT_ACCOUNT_PASSWORD', '')
      env.set('DEFAULT_ACCOUNT_NAME', '')
    }
  })

  test('creates the account with a verified email, then changes nothing', async ({ assert }) => {
    assert.equal(await ensureDefaultAccount(configOrFail()), EnsureDefaultAccountResult.Created)

    const user = await User.verifyCredentials(EMAIL, PASSWORD)
    assert.equal(user.fullName, 'Admin')
    assert.isNotNull(user.emailVerifiedAt)

    assert.equal(await ensureDefaultAccount(configOrFail()), EnsureDefaultAccountResult.Unchanged)
  })

  test('brings the password back in line with the environment', async ({ assert }) => {
    await User.create({ email: EMAIL, password: 'some-older-passphrase' })

    assert.equal(await ensureDefaultAccount(configOrFail()), EnsureDefaultAccountResult.Updated)
    const user = await User.verifyCredentials(EMAIL, PASSWORD)
    assert.isNotNull(user.emailVerifiedAt)
  })

  test('refuses a password shorter than 12 characters', async ({ assert }) => {
    env.set('DEFAULT_ACCOUNT_PASSWORD', 'short')
    await assert.rejects(() => ensureDefaultAccount(configOrFail()))
  })

  test('is flagged as managed by the environment', async ({ client }) => {
    await ensureDefaultAccount(configOrFail())
    const user = await User.findByOrFail('email', EMAIL)
    const other = await User.create({ email: 'someone@example.com', password: PASSWORD })

    const me = await client.get('/auth/me').header('accept', 'application/json').loginAs(user)
    me.assertBodyContains({ user: { email: EMAIL, managedByEnvironment: true } })

    const them = await client.get('/auth/me').header('accept', 'application/json').loginAs(other)
    them.assertBodyContains({ user: { managedByEnvironment: false } })
  })

  test('cannot change its password, its email or be deleted', async ({ client }) => {
    await ensureDefaultAccount(configOrFail())
    const user = await User.findByOrFail('email', EMAIL)

    const password = await client
      .put('/account/password')
      .header('accept', 'application/json')
      .loginAs(user)
      .json({ currentPassword: PASSWORD, newPassword: 'a-brand-new-passphrase' })
    password.assertStatus(403)

    const email = await client
      .patch('/account')
      .header('accept', 'application/json')
      .loginAs(user)
      .json({ email: 'new-admin@example.com' })
    email.assertStatus(403)

    const deletion = await client
      .delete('/account')
      .header('accept', 'application/json')
      .loginAs(user)
      .json({ password: PASSWORD })
    deletion.assertStatus(403)
  })

  test('can still change its display name', async ({ client }) => {
    await ensureDefaultAccount(configOrFail())
    const user = await User.findByOrFail('email', EMAIL)

    const response = await client
      .patch('/account')
      .header('accept', 'application/json')
      .loginAs(user)
      .json({ fullName: 'Matthieu' })
    response.assertStatus(200)
    response.assertBodyContains({ user: { fullName: 'Matthieu' } })
  })

  test('gets no password reset email', async ({ client }) => {
    using fake = mail.fake()
    await ensureDefaultAccount(configOrFail())

    const response = await client
      .post('/auth/forgot-password')
      .header('accept', 'application/json')
      .json({ email: EMAIL })
    response.assertStatus(200)
    fake.mails.assertNoneQueued()
  })
})

test.group('Auth - registration switch', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('sign-up reads as not found while registration is disabled', async ({ client }) => {
    env.set('REGISTRATION_ENABLED', false)

    const response = await client.post('/auth/register').header('accept', 'application/json').json({
      email: 'ada.lovelace@example.com',
      password: 'a-very-strong-passphrase',
    })

    response.assertStatus(404)
  })
})
