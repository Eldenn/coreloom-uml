import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import Note from '#app/notes/models/note'
import { PAGINATION_MAX_PER_PAGE } from '#app/shared/pagination/paginate'
import User from '#app/users/models/user'

function makeUser(email: string) {
  return User.create({ email, password: 'a-very-strong-passphrase' })
}

async function seedNotes(userId: number, count: number) {
  for (let i = 1; i <= count; i++) {
    await Note.create({ userId, title: `Note ${i}`, body: `Body ${i}` })
  }
}

test.group('Notes', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates a note and returns 201 with its shape', async ({ client, assert }) => {
    const user = await makeUser('notes-create@example.com')

    const response = await client
      .post('/notes')
      .header('accept', 'application/json')
      .loginAs(user)
      .json({ title: 'First note', body: 'Hello' })

    response.assertStatus(201)
    response.assertBodyContains({ note: { title: 'First note', body: 'Hello', userId: user.id } })
    assert.isNumber(response.body().note.id)
    assert.isString(response.body().note.createdAt)
  })

  test('rejects a note without a title with 422', async ({ client }) => {
    const user = await makeUser('notes-invalid@example.com')

    const response = await client
      .post('/notes')
      .header('accept', 'application/json')
      .loginAs(user)
      .json({ body: 'No title here' })

    response.assertStatus(422)
  })

  test('rejects an unauthenticated request with 401', async ({ client }) => {
    const response = await client
      .post('/notes')
      .header('accept', 'application/json')
      .json({ title: 'Nope', body: 'Nope' })

    response.assertStatus(401)
  })

  test('lists only the caller notes, paginated with correct meta', async ({ client, assert }) => {
    const user = await makeUser('notes-list@example.com')
    const other = await makeUser('notes-list-other@example.com')
    await seedNotes(user.id, 25)
    await seedNotes(other.id, 3)

    const page1 = await client.get('/notes').header('accept', 'application/json').loginAs(user)
    page1.assertStatus(200)
    assert.lengthOf(page1.body().data, 20)
    assert.deepInclude(page1.body().meta, { page: 1, perPage: 20, total: 25, lastPage: 2 })

    const page2 = await client
      .get('/notes')
      .qs({ page: 2 })
      .header('accept', 'application/json')
      .loginAs(user)
    page2.assertStatus(200)
    assert.lengthOf(page2.body().data, 5)
    assert.equal(page2.body().meta.page, 2)

    // None of the other user's notes leak in.
    const allIds = [...page1.body().data, ...page2.body().data].map((n: { id: number }) => n.id)
    const otherIds = (await Note.query().where('userId', other.id)).map((n) => n.id)
    assert.notInclude(allIds, otherIds[0])
  })

  test('clamps perPage down to the cap', async ({ client, assert }) => {
    const user = await makeUser('notes-cap@example.com')
    await seedNotes(user.id, 3)

    const response = await client
      .get('/notes')
      .qs({ perPage: PAGINATION_MAX_PER_PAGE + 500 })
      .header('accept', 'application/json')
      .loginAs(user)

    response.assertStatus(200)
    assert.equal(response.body().meta.perPage, PAGINATION_MAX_PER_PAGE)
  })

  test('rejects a non-positive perPage with 422', async ({ client }) => {
    const user = await makeUser('notes-badpage@example.com')

    const response = await client
      .get('/notes')
      .qs({ perPage: 0 })
      .header('accept', 'application/json')
      .loginAs(user)

    response.assertStatus(422)
  })

  test('shows, updates and destroys an owned note', async ({ client, assert }) => {
    const user = await makeUser('notes-crud@example.com')
    const note = await Note.create({ userId: user.id, title: 'Original', body: 'Original body' })

    const show = await client
      .get(`/notes/${note.id}`)
      .header('accept', 'application/json')
      .loginAs(user)
    show.assertStatus(200)
    show.assertBodyContains({ note: { id: note.id, title: 'Original' } })

    const update = await client
      .patch(`/notes/${note.id}`)
      .header('accept', 'application/json')
      .loginAs(user)
      .json({ title: 'Updated' })
    update.assertStatus(200)
    update.assertBodyContains({ note: { id: note.id, title: 'Updated', body: 'Original body' } })

    const destroy = await client
      .delete(`/notes/${note.id}`)
      .header('accept', 'application/json')
      .loginAs(user)
    destroy.assertStatus(204)
    assert.isNull(await Note.find(note.id))
  })

  test("hides another user's note behind a 404 for show/update/destroy", async ({
    client,
    assert,
  }) => {
    const owner = await makeUser('notes-owner@example.com')
    const intruder = await makeUser('notes-intruder@example.com')
    const note = await Note.create({ userId: owner.id, title: 'Private', body: 'Secret' })

    const show = await client
      .get(`/notes/${note.id}`)
      .header('accept', 'application/json')
      .loginAs(intruder)
    show.assertStatus(404)

    const update = await client
      .patch(`/notes/${note.id}`)
      .header('accept', 'application/json')
      .loginAs(intruder)
      .json({ title: 'Hacked' })
    update.assertStatus(404)

    const destroy = await client
      .delete(`/notes/${note.id}`)
      .header('accept', 'application/json')
      .loginAs(intruder)
    destroy.assertStatus(404)

    await note.refresh()
    assert.equal(note.title, 'Private')
  })

  test('returns 404 for a note that does not exist', async ({ client }) => {
    const user = await makeUser('notes-missing@example.com')

    const response = await client
      .get('/notes/999999')
      .header('accept', 'application/json')
      .loginAs(user)

    response.assertStatus(404)
  })
})
