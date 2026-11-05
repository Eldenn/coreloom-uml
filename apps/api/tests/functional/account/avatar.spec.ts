import testUtils from '@adonisjs/core/services/test_utils'
import drive from '@adonisjs/drive/services/main'
import { test } from '@japa/runner'
import User from '#app/users/models/user'

// 1x1 transparent PNG — a real magic number so bodyparser detects `png`.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

function makeUser(email: string) {
  return User.create({ email, password: 'a-very-strong-passphrase' })
}

test.group('Account - avatar', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  // No real MinIO in the suite — CI runs with DRIVE_DISK=fs anyway.
  group.each.setup(() => {
    drive.fake()
    return () => drive.restore()
  })

  test('uploads an avatar and exposes the relative path', async ({ client, assert }) => {
    const user = await makeUser('avatar-upload@example.com')

    const response = await client
      .post('/account/avatar')
      .header('accept', 'application/json')
      .loginAs(user)
      .file('avatar', PNG_BYTES, { filename: 'avatar.png', contentType: 'image/png' })

    response.assertStatus(200)
    response.assertBodyContains({ user: { avatarUrl: '/account/avatar' } })

    await user.refresh()
    assert.equal(user.avatarKey, `avatars/${user.id}.png`)
    assert.isTrue(await drive.use().exists(`avatars/${user.id}.png`))
  })

  test('rejects a non-image file with 422', async ({ client }) => {
    const user = await makeUser('avatar-nonimage@example.com')

    const response = await client
      .post('/account/avatar')
      .header('accept', 'application/json')
      .loginAs(user)
      .file('avatar', Buffer.from('not an image'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      })

    response.assertStatus(422)
  })

  test('rejects a file larger than 5 MB with 422', async ({ client }) => {
    const user = await makeUser('avatar-toobig@example.com')

    const response = await client
      .post('/account/avatar')
      .header('accept', 'application/json')
      .loginAs(user)
      .file('avatar', Buffer.alloc(6 * 1024 * 1024), {
        filename: 'big.png',
        contentType: 'image/png',
      })

    response.assertStatus(422)
  })

  test('streams the avatar bytes back with the right content type', async ({ client, assert }) => {
    const user = await makeUser('avatar-download@example.com')
    await client
      .post('/account/avatar')
      .header('accept', 'application/json')
      .loginAs(user)
      .file('avatar', PNG_BYTES, { filename: 'avatar.png', contentType: 'image/png' })

    const response = await client.get('/account/avatar').loginAs(user)

    response.assertStatus(200)
    response.assertHeader('content-type', 'image/png')
    assert.deepEqual(Buffer.from(response.response.body), PNG_BYTES)
  })

  test('returns 404 when the user has no avatar', async ({ client }) => {
    const user = await makeUser('avatar-none@example.com')

    const response = await client
      .get('/account/avatar')
      .header('accept', 'application/json')
      .loginAs(user)

    response.assertStatus(404)
  })

  test('removes the avatar and clears the path', async ({ client, assert }) => {
    const user = await makeUser('avatar-delete@example.com')
    await client
      .post('/account/avatar')
      .header('accept', 'application/json')
      .loginAs(user)
      .file('avatar', PNG_BYTES, { filename: 'avatar.png', contentType: 'image/png' })

    const response = await client
      .delete('/account/avatar')
      .header('accept', 'application/json')
      .loginAs(user)

    response.assertStatus(200)
    response.assertBodyContains({ user: { avatarUrl: null } })

    await user.refresh()
    assert.isNull(user.avatarKey)
    assert.isFalse(await drive.use().exists(`avatars/${user.id}.png`))
  })

  test('rejects an unauthenticated upload with 401', async ({ client }) => {
    const response = await client
      .post('/account/avatar')
      .header('accept', 'application/json')
      .file('avatar', PNG_BYTES, { filename: 'avatar.png', contentType: 'image/png' })

    response.assertStatus(401)
  })
})
