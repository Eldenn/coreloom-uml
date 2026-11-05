import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import User from '#app/users/models/user'

test.group('Auth - logout', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('ends the session', async ({ client }) => {
    const user = await User.create({
      email: 'logout@example.com',
      password: 'a-very-strong-passphrase',
    })

    const response = await client
      .post('/auth/logout')
      .header('accept', 'application/json')
      .loginAs(user)

    response.assertStatus(204)
  })

  test('requires an authenticated session', async ({ client }) => {
    const response = await client.post('/auth/logout').header('accept', 'application/json')

    response.assertStatus(401)
  })
})
