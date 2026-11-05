import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'
import Architecture from '#app/architectures/models/architecture'
import { ACCESS_CODE_ALPHABET, ACCESS_GRANT_COOKIE } from '#app/sharing/constants/sharing'
import User from '#app/users/models/user'

const json = { accept: 'application/json' }

async function setup(client: TestContext['client']) {
  const user = await User.create({
    email: `share-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
  const created = await client
    .post('/architectures')
    .headers(json)
    .loginAs(user)
    .json({ title: 'Payments', description: 'How money moves' })
  const id: number = created.body().architecture.id
  const share = (visibility: string) =>
    client.put(`/architectures/${id}/sharing`).headers(json).loginAs(user).json({ visibility })
  return { user, id, share }
}

function tokenOf(link: string) {
  return link.split('/s/')[1]
}

test.group('Sharing - owner settings', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('starts private, with no link and no code', async ({ client }) => {
    const { user, id } = await setup(client)

    const response = await client.get(`/architectures/${id}/sharing`).headers(json).loginAs(user)

    response.assertStatus(200)
    response.assertBody({ sharing: { visibility: 'private', link: null, code: null } })
  })

  test('public mints a long random link on the web app', async ({ client, assert }) => {
    const { share } = await setup(client)

    const response = await share('public')

    response.assertStatus(200)
    const { link, code } = response.body().sharing
    assert.match(link, /^http:\/\/localhost:5173\/s\/[A-Za-z0-9_-]{22}$/)
    assert.isNull(code)
  })

  test('protected adds a server-made 8 character code without look-alikes', async ({
    client,
    assert,
  }) => {
    const { share } = await setup(client)

    const { code } = (await share('protected')).body().sharing
    assert.lengthOf(code, 8)
    for (const char of code) assert.include(ACCESS_CODE_ALPHABET, char)
  })

  test('stores the code encrypted', async ({ client, assert }) => {
    const { id, share } = await setup(client)
    const { code } = (await share('protected')).body().sharing

    const stored = await Architecture.findOrFail(id)
    assert.isString(stored.accessCode)
    assert.notInclude(stored.accessCode ?? '', code)
  })

  test('going private and back keeps the same link', async ({ client, assert }) => {
    const { share } = await setup(client)
    const first = (await share('public')).body().sharing.link

    await share('private')
    const again = (await share('public')).body().sharing.link

    assert.equal(again, first)
  })

  test('regenerating the link changes it', async ({ client, assert }) => {
    const { user, id, share } = await setup(client)
    const first = (await share('public')).body().sharing.link

    const response = await client
      .post(`/architectures/${id}/sharing/regenerate-link`)
      .headers(json)
      .loginAs(user)

    assert.notEqual(response.body().sharing.link, first)
  })

  test('the code can only be regenerated while protected', async ({ client, assert }) => {
    const { user, id, share } = await setup(client)
    await share('public')
    const url = `/architectures/${id}/sharing/regenerate-code`

    const refused = await client.post(url).headers(json).loginAs(user)
    refused.assertStatus(409)

    const first = (await share('protected')).body().sharing.code
    const response = await client.post(url).headers(json).loginAs(user)
    response.assertStatus(200)
    assert.notEqual(response.body().sharing.code, first)
  })

  test('another user gets a 404', async ({ client }) => {
    const { id } = await setup(client)
    const intruder = await User.create({
      email: 'share-intruder@example.com',
      password: 'a-very-strong-passphrase',
    })

    const response = await client
      .get(`/architectures/${id}/sharing`)
      .headers(json)
      .loginAs(intruder)
    response.assertStatus(404)
  })
})

test.group('Sharing - visitors', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('a public link shows the architecture read-only, without the owner', async ({
    client,
    assert,
  }) => {
    const { share } = await setup(client)
    const token = tokenOf((await share('public')).body().sharing.link)

    const response = await client.get(`/shared/${token}`).headers(json)

    response.assertStatus(200)
    response.assertHeader('x-robots-tag', 'noindex, nofollow')
    response.assertBodyContains({
      architecture: { title: 'Payments', description: 'How money moves' },
      isOwner: false,
      architectureId: null,
    })
    const body = JSON.stringify(response.body())
    assert.notInclude(body, '@example.com')
    assert.notProperty(response.body().architecture.diagrams[0], 'version')
  })

  test('private, regenerated and unknown links all read the same', async ({ client }) => {
    const { user, id, share } = await setup(client)
    const token = tokenOf((await share('public')).body().sharing.link)
    await share('private')

    const closed = await client.get(`/shared/${token}`).headers(json)
    closed.assertStatus(404)
    closed.assertBodyContains({ error: { code: 'link_unavailable' } })

    await share('public')
    await client.post(`/architectures/${id}/sharing/regenerate-link`).headers(json).loginAs(user)
    const old = await client.get(`/shared/${token}`).headers(json)
    old.assertStatus(404)
    old.assertBodyContains({ error: { code: 'link_unavailable' } })

    const unknown = await client.get('/shared/not-a-real-token').headers(json)
    unknown.assertBodyContains({ error: { code: 'link_unavailable' } })
  })

  test('a protected link asks for the code and shows only the title', async ({
    client,
    assert,
  }) => {
    const { share } = await setup(client)
    const token = tokenOf((await share('protected')).body().sharing.link)

    const response = await client.get(`/shared/${token}`).headers(json)

    response.assertStatus(401)
    response.assertBodyContains({ error: { code: 'access_code_required' }, title: 'Payments' })
    assert.notProperty(response.body(), 'architecture')
  })

  test('the right code opens the link for this browser', async ({ client }) => {
    const { share } = await setup(client)
    const { link, code } = (await share('protected')).body().sharing
    const token = tokenOf(link)

    const unlock = await client
      .post(`/shared/${token}/unlock`)
      .headers(json)
      .json({ code: `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}` })
    unlock.assertStatus(200)
    const grant = unlock.cookie(ACCESS_GRANT_COOKIE)?.value

    const show = await client
      .get(`/shared/${token}`)
      .headers(json)
      .encryptedCookie(ACCESS_GRANT_COOKIE, grant)
    show.assertStatus(200)
    show.assertBodyContains({ architecture: { title: 'Payments' } })
  })

  test('a new code shuts out browsers that entered the old one', async ({ client }) => {
    const { user, id, share } = await setup(client)
    const { link, code } = (await share('protected')).body().sharing
    const token = tokenOf(link)
    const unlock = await client.post(`/shared/${token}/unlock`).headers(json).json({ code })
    const grant = unlock.cookie(ACCESS_GRANT_COOKIE)?.value

    await client.post(`/architectures/${id}/sharing/regenerate-code`).headers(json).loginAs(user)

    const show = await client
      .get(`/shared/${token}`)
      .headers(json)
      .encryptedCookie(ACCESS_GRANT_COOKIE, grant)
    show.assertStatus(401)
  })

  test('five wrong codes block the link for this IP', async ({ client, assert }) => {
    const { share } = await setup(client)
    const { link, code } = (await share('protected')).body().sharing
    const token = tokenOf(link)
    const url = `/shared/${token}/unlock`

    for (let left = 4; left >= 0; left--) {
      const wrong = await client.post(url).headers(json).json({ code: 'WRONGCOD' })
      wrong.assertStatus(422)
      wrong.assertBodyContains({ error: { code: 'wrong_access_code' }, attemptsLeft: left })
    }

    const blocked = await client.post(url).headers(json).json({ code })
    blocked.assertStatus(429)
    blocked.assertBodyContains({ error: { code: 'too_many_attempts' } })
    assert.isAbove(blocked.body().retryAfterSeconds, 0)
  })

  test('the signed-in owner skips the code', async ({ client }) => {
    const { user, id, share } = await setup(client)
    const token = tokenOf((await share('protected')).body().sharing.link)

    const response = await client.get(`/shared/${token}`).headers(json).loginAs(user)

    response.assertStatus(200)
    response.assertBodyContains({ isOwner: true, architectureId: id })
  })
})
