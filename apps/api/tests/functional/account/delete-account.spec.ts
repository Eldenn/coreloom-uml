import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import User from '#app/users/models/user'

test.group('Account - delete account', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('deletes the account with the correct password', async ({ client, assert }) => {
    const user = await User.create({
      email: 'del@example.com',
      password: 'a-very-strong-passphrase',
    })

    const response = await client
      .delete('/account')
      .header('accept', 'application/json')
      .loginAs(user)
      .json({ password: 'a-very-strong-passphrase' })

    response.assertStatus(204)
    assert.isNull(await User.find(user.id))
  })

  test('rejects a wrong password and keeps the account', async ({ client, assert }) => {
    const user = await User.create({
      email: 'del-wrong@example.com',
      password: 'a-very-strong-passphrase',
    })

    const response = await client
      .delete('/account')
      .header('accept', 'application/json')
      .loginAs(user)
      .json({ password: 'not-the-password' })

    response.assertStatus(400)
    assert.isNotNull(await User.find(user.id))
  })

  test('rejects an unauthenticated request', async ({ client }) => {
    const response = await client
      .delete('/account')
      .header('accept', 'application/json')
      .json({ password: 'a-very-strong-passphrase' })

    response.assertStatus(401)
  })
})
