import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { test } from '@japa/runner'
import Architecture from '#app/architectures/models/architecture'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }

function makeUser(email: string) {
  return User.create({ email, password: 'a-very-strong-passphrase' })
}

async function setup(email: string, flagOn = true) {
  const user = await makeUser(email)
  if (flagOn) await updateFlag(FeatureFlagKey.DiagramAssistant, ON, user)
  const architecture = await Architecture.create({
    userId: user.id,
    title: 'Shop',
    visibility: 'private',
  })
  return { user, architecture, base: `/architectures/${architecture.id}/assistant/conversations` }
}

test.group('Assistant conversations', (group) => {
  group.each.setup(() => withDefaultFlags())

  test('404 while the flag is off', async ({ client }) => {
    const { user, base } = await setup('assist-off@example.com', false)
    for (const response of [
      await client.get(base).headers(json).loginAs(user),
      await client.post(base).headers(json).loginAs(user).json({}),
      await client.get(`${base}/1`).headers(json).loginAs(user),
      await client.patch(`${base}/1`).headers(json).loginAs(user).json({ title: 'x' }),
      await client.delete(`${base}/1`).headers(json).loginAs(user),
    ])
      response.assertStatus(404)
  })

  test('creates, lists, renames and deletes', async ({ client, assert }) => {
    const { user, base } = await setup('assist-crud@example.com')

    const created = await client.post(base).headers(json).loginAs(user).json({ title: 'First' })
    created.assertStatus(201)
    const { id } = created.body().conversation
    const untitled = await client.post(base).headers(json).loginAs(user).json({})
    untitled.assertStatus(201)
    assert.equal(untitled.body().conversation.title, '')

    const list = await client.get(base).headers(json).loginAs(user)
    list.assertStatus(200)
    assert.lengthOf(list.body().conversations, 2)
    assert.equal(list.body().conversations[0].id, untitled.body().conversation.id)

    const show = await client.get(`${base}/${id}`).headers(json).loginAs(user)
    show.assertStatus(200)
    assert.deepEqual(show.body().messages, [])
    assert.equal(show.body().conversation.title, 'First')

    const renamed = await client
      .patch(`${base}/${id}`)
      .headers(json)
      .loginAs(user)
      .json({ title: 'Renamed' })
    renamed.assertStatus(200)
    assert.equal(renamed.body().conversation.title, 'Renamed')
    const blank = await client
      .patch(`${base}/${id}`)
      .headers(json)
      .loginAs(user)
      .json({ title: '  ' })
    blank.assertStatus(422)

    const removed = await client.delete(`${base}/${id}`).headers(json).loginAs(user)
    removed.assertStatus(204)
    assert.isNull(await AssistantConversation.find(id))
  })

  test("hides another account's architecture and conversation behind 404", async ({ client }) => {
    const { user, base } = await setup('assist-owner@example.com')
    const { user: other } = await setup('assist-other@example.com')
    const created = await client.post(base).headers(json).loginAs(user).json({})
    const path = `${base}/${created.body().conversation.id}`

    for (const response of [
      await client.get(base).headers(json).loginAs(other),
      await client.post(base).headers(json).loginAs(other).json({}),
      await client.get(path).headers(json).loginAs(other),
      await client.patch(path).headers(json).loginAs(other).json({ title: 'x' }),
      await client.delete(path).headers(json).loginAs(other),
    ])
      response.assertStatus(404)
  })

  test("reads a conversation through another architecture's path as 404", async ({ client }) => {
    const { user, base } = await setup('assist-mismatch@example.com')
    const second = await Architecture.create({
      userId: user.id,
      title: 'Other',
      visibility: 'private',
    })
    const created = await client.post(base).headers(json).loginAs(user).json({})
    const response = await client
      .get(`/architectures/${second.id}/assistant/conversations/${created.body().conversation.id}`)
      .headers(json)
      .loginAs(user)
    response.assertStatus(404)
  })

  test('refuses an API token (401)', async ({ client }) => {
    const { user, base } = await setup('assist-token@example.com')
    const token = await User.accessTokens.create(user, ['read', 'write'], { name: 'ci' })
    const response = await client
      .get(base)
      .headers({ ...json, authorization: `Bearer ${token.value?.release()}` })
    response.assertStatus(401)
  })

  test('deleting the architecture deletes its conversations', async ({ client, assert }) => {
    const { user, architecture, base } = await setup('assist-cascade@example.com')
    const created = await client.post(base).headers(json).loginAs(user).json({})
    await client.delete(`/architectures/${architecture.id}`).headers(json).loginAs(user)
    assert.isNull(await AssistantConversation.find(created.body().conversation.id))
  })
})
