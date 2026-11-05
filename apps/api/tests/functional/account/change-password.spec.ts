import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import User from '#app/users/models/user'

test.group('Account - change password', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('changes the password with the correct current password', async ({ client, assert }) => {
    const user = await User.create({
      email: 'cp@example.com',
      password: 'the-old-passphrase',
    })

    const response = await client
      .put('/account/password')
      .header('accept', 'application/json')
      .loginAs(user)
      .json({ currentPassword: 'the-old-passphrase', newPassword: 'a-brand-new-passphrase' })

    response.assertStatus(200)
    const updated = await User.verifyCredentials('cp@example.com', 'a-brand-new-passphrase')
    assert.equal(updated.id, user.id)
  })

  test('rejects a wrong current password', async ({ client }) => {
    const user = await User.create({
      email: 'cp-wrong@example.com',
      password: 'the-old-passphrase',
    })

    const response = await client
      .put('/account/password')
      .header('accept', 'application/json')
      .loginAs(user)
      .json({ currentPassword: 'not-the-current-one', newPassword: 'a-brand-new-passphrase' })

    response.assertStatus(400)
  })

  test('rejects a weak new password', async ({ client }) => {
    const user = await User.create({
      email: 'cp-weak@example.com',
      password: 'the-old-passphrase',
    })

    const response = await client
      .put('/account/password')
      .header('accept', 'application/json')
      .loginAs(user)
      .json({ currentPassword: 'the-old-passphrase', newPassword: 'short' })

    response.assertStatus(422)
  })

  test('rejects an unauthenticated request', async ({ client }) => {
    const response = await client
      .put('/account/password')
      .header('accept', 'application/json')
      .json({ currentPassword: 'whatever', newPassword: 'a-brand-new-passphrase' })

    response.assertStatus(401)
  })
})
