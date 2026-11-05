import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import User from '#app/users/models/user'

test.group('Auth - login and me', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('logs in with valid credentials', async ({ client }) => {
    await User.create({
      email: 'login@example.com',
      password: 'a-very-strong-passphrase',
      fullName: 'Login User',
    })

    const response = await client.post('/auth/login').header('accept', 'application/json').json({
      email: 'login@example.com',
      password: 'a-very-strong-passphrase',
    })

    response.assertStatus(200)
    response.assertBodyContains({ user: { email: 'login@example.com' } })
  })

  test('rejects invalid credentials', async ({ client }) => {
    await User.create({
      email: 'wrong@example.com',
      password: 'a-very-strong-passphrase',
    })

    const response = await client.post('/auth/login').header('accept', 'application/json').json({
      email: 'wrong@example.com',
      password: 'not-the-right-password',
    })

    response.assertStatus(400)
  })

  test('reads the current user from an authenticated session', async ({ client, assert }) => {
    const user = await User.create({
      email: 'me@example.com',
      password: 'a-very-strong-passphrase',
      fullName: 'Me User',
    })

    const response = await client.get('/auth/me').header('accept', 'application/json').loginAs(user)

    response.assertStatus(200)
    assert.equal(response.body().user.email, 'me@example.com')
  })

  test('rejects /auth/me without a session', async ({ client }) => {
    const response = await client.get('/auth/me').header('accept', 'application/json')

    response.assertStatus(401)
  })
})
