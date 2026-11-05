import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import { createPasswordResetToken } from '#app/auth/services/email-token'
import User from '#app/users/models/user'

test.group('Auth - reset password', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('resets the password with a valid token', async ({ client, assert }) => {
    const user = await User.create({
      email: 'reset@example.com',
      password: 'the-old-passphrase',
    })
    const token = createPasswordResetToken(user)

    const response = await client
      .post('/auth/reset-password')
      .header('accept', 'application/json')
      .json({ token, password: 'a-brand-new-passphrase' })

    response.assertStatus(200)

    const updated = await User.verifyCredentials('reset@example.com', 'a-brand-new-passphrase')
    assert.equal(updated.id, user.id)
  })

  test('rejects a reset token already used once', async ({ client }) => {
    const user = await User.create({
      email: 'reused@example.com',
      password: 'the-old-passphrase',
    })
    const token = createPasswordResetToken(user)

    await client.post('/auth/reset-password').header('accept', 'application/json').json({
      token,
      password: 'a-brand-new-passphrase',
    })

    const response = await client
      .post('/auth/reset-password')
      .header('accept', 'application/json')
      .json({ token, password: 'yet-another-passphrase' })

    response.assertStatus(400)
  })

  test('rejects an invalid token', async ({ client }) => {
    const response = await client
      .post('/auth/reset-password')
      .header('accept', 'application/json')
      .json({ token: 'not-a-real-token', password: 'a-brand-new-passphrase' })

    response.assertStatus(400)
  })
})
