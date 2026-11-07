import testUtils from '@adonisjs/core/services/test_utils'
import { test } from '@japa/runner'
import User from '#app/users/models/user'

const json = { accept: 'application/json' }

async function signedIn() {
  return User.create({
    email: `validate-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'a-very-strong-passphrase',
  })
}

test.group('UML - validate', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('reads valid text and gives back the diagram as JSON', async ({ client }) => {
    const user = await signedIn()

    const response = await client
      .post('/uml/validate')
      .headers(json)
      .loginAs(user)
      .json({ source: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n' })

    response.assertStatus(200)
    response.assertBodyContains({
      valid: true,
      format: 'mermaid',
      kind: 'er',
      diagram: { kind: 'er' },
      problems: [],
    })
  })

  test('lists the problems of text it cannot fully read', async ({ client }) => {
    const user = await signedIn()

    const response = await client
      .post('/uml/validate')
      .headers(json)
      .loginAs(user)
      .json({ source: 'classDiagram\n  class A\n  ??? nope\n' })

    response.assertStatus(200)
    response.assertBodyContains({
      valid: false,
      format: 'mermaid',
      kind: null,
      diagram: null,
      problems: [{ line: 3, severity: 'error' }],
    })
  })

  test('checks JSON content against the schema', async ({ client, assert }) => {
    const user = await signedIn()

    const valid = await client
      .post('/uml/validate')
      .headers(json)
      .loginAs(user)
      .json({ content: { kind: 'class', classes: [{ id: 'A' }], relations: [] } })
    valid.assertBodyContains({ valid: true, format: 'json', kind: 'class' })

    const invalid = await client
      .post('/uml/validate')
      .headers(json)
      .loginAs(user)
      .json({ content: { kind: 'class', classes: 'A' } })
    invalid.assertStatus(200)
    assert.isFalse(invalid.body().valid)
    assert.isTrue(invalid.body().problems.some((p: { code: string }) => p.code === 'schema'))
  })

  test('needs text or content, and a session', async ({ client }) => {
    const user = await signedIn()

    const empty = await client.post('/uml/validate').headers(json).loginAs(user).json({})
    empty.assertStatus(422)

    const anonymous = await client
      .post('/uml/validate')
      .headers(json)
      .json({ source: 'classDiagram\n  class A\n' })
    anonymous.assertStatus(401)
  })
})
