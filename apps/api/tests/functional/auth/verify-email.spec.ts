import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import { createEmailVerificationToken } from '#app/auth/services/email-token'
import User from '#app/users/models/user'

test.group('Auth - verify email', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('verifies the email with a valid token', async ({ client, assert }) => {
    const user = await User.create({
      email: 'verify@example.com',
      password: 'a-very-strong-passphrase',
    })
    const token = createEmailVerificationToken(user)

    const response = await client
      .get('/auth/verify-email')
      .qs({ token })
      .header('accept', 'application/json')

    response.assertStatus(200)
    await user.refresh()
    assert.isNotNull(user.emailVerifiedAt)
  })

  test('rejects an invalid token', async ({ client }) => {
    const response = await client
      .get('/auth/verify-email')
      .qs({ token: 'not-a-real-token' })
      .header('accept', 'application/json')

    response.assertStatus(400)
  })
})
