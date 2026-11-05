import testUtils from '@adonisjs/core/services/test_utils'
import mail from '@adonisjs/mail/services/main'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import VerifyEmailMail from '#app/auth/mails/verify-email-mail'
import User from '#app/users/models/user'

test.group('Account - update profile', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('updates the full name', async ({ client, assert }) => {
    const user = await User.create({
      email: 'profile@example.com',
      password: 'a-very-strong-passphrase',
      fullName: 'Old Name',
    })

    const response = await client
      .patch('/account')
      .header('accept', 'application/json')
      .loginAs(user)
      .json({ fullName: 'New Name' })

    response.assertStatus(200)
    response.assertBodyContains({ user: { fullName: 'New Name' } })
    await user.refresh()
    assert.equal(user.fullName, 'New Name')
  })

  test('changing the email unverifies it and sends a verification email', async ({
    client,
    assert,
  }) => {
    using fake = mail.fake()
    const user = await User.create({
      email: 'before@example.com',
      password: 'a-very-strong-passphrase',
    })
    user.emailVerifiedAt = DateTime.now()
    await user.save()

    const response = await client
      .patch('/account')
      .header('accept', 'application/json')
      .loginAs(user)
      .json({ email: 'After@Example.com' })

    response.assertStatus(200)
    response.assertBodyContains({ user: { email: 'after@example.com', emailVerifiedAt: null } })
    await user.refresh()
    assert.isNull(user.emailVerifiedAt)
    fake.mails.assertQueued(VerifyEmailMail, ({ message }) => message.hasTo('after@example.com'))
  })

  test('rejects an email already used by another account', async ({ client }) => {
    using _fake = mail.fake()
    await User.create({ email: 'taken@example.com', password: 'a-very-strong-passphrase' })
    const user = await User.create({
      email: 'mine@example.com',
      password: 'a-very-strong-passphrase',
    })

    const response = await client
      .patch('/account')
      .header('accept', 'application/json')
      .loginAs(user)
      .json({ email: 'taken@example.com' })

    response.assertStatus(409)
  })

  test('rejects an unauthenticated request', async ({ client }) => {
    const response = await client
      .patch('/account')
      .header('accept', 'application/json')
      .json({ fullName: 'Nobody' })

    response.assertStatus(401)
  })
})
