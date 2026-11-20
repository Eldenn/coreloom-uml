import app from '@adonisjs/core/services/app'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { FILE_DIGEST_MAX_LENGTH, type LanguageModel } from '@coreloom-uml/llm'
import { answeringModel, failingModel } from '@coreloom-uml/llm/testing'
import { test } from '@japa/runner'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import LanguageModels from '#app/llm/services/language-models'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { captureLogs, dumpDatabase } from '#tests/helpers/leaks'

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
const OFF = { enabled: false, rollout: 0, rules: [] }
const PATH = '/assistant/files/digest'
/** The fixture key: it must never show up in a response, a log line or the database. */
const KEY = 'sk-fixture-digest-never-stored'
const CONTENT = 'The billing service ships invoices with pnpm.\n'.repeat(2000)
const body = {
  provider: { kind: 'mistral', model: 'mistral-small-latest' },
  apiKey: KEY,
  file: { name: 'book.pdf', content: CONTENT },
}

function useModel(model: LanguageModel) {
  app.container.swap(LanguageModels, () => {
    const fake = new LanguageModels()
    fake.create = () => model
    return fake
  })
}

async function makeUser(email: string) {
  const user = await User.create({ email, password: 'a-very-strong-passphrase' })
  await updateFlag(FeatureFlagKey.DiagramAssistant, ON, user)
  return user
}

test.group('Assistant files - digest', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(() => app.container.restore(LanguageModels))

  test('answers notes as a file; the file, the notes and the key are stored and logged nowhere', async ({
    client,
    assert,
  }) => {
    const user = await makeUser('digest@example.com')
    const model = answeringModel('- Billing ships invoices')
    useModel(model)
    const logs = captureLogs()

    const response = await client.post(PATH).headers(json).loginAs(user).json(body)
    logs.restore()
    const logged = logs.lines.join('\n')

    response.assertStatus(200)
    assert.equal(response.body().file.name, 'book.pdf')
    assert.include(response.body().file.content, '## Part 1\n- Billing ships invoices')
    assert.equal(response.body().parts, 2)
    assert.equal(response.body().failed, 0)
    assert.lengthOf(model.doGenerateCalls, 2)
    for (const secret of [KEY, 'billing service', 'Billing ships invoices']) {
      assert.notInclude(logged, secret)
      assert.notInclude(await dumpDatabase(), secret)
    }
  })

  test('502 with the reason when no part could be read', async ({ client, assert }) => {
    const user = await makeUser('digest-fails@example.com')
    useModel(failingModel(new Error('boom')))

    const response = await client.post(PATH).headers(json).loginAs(user).json(body)

    response.assertStatus(502)
    assert.exists(response.body().reason)
  })

  test('422 past the longest file, 404 with the assistant off, 401 signed out', async ({
    client,
  }) => {
    const user = await makeUser('digest-long@example.com')
    useModel(answeringModel('- x'))
    const long = { name: 'a.txt', content: 'x'.repeat(FILE_DIGEST_MAX_LENGTH + 1) }

    const tooLong = await client
      .post(PATH)
      .headers(json)
      .loginAs(user)
      .json({ ...body, file: long })
    tooLong.assertStatus(422)
    const anonymous = await client.post(PATH).headers(json).json(body)
    anonymous.assertStatus(401)
    await updateFlag(FeatureFlagKey.DiagramAssistant, OFF, user)
    const disabled = await client.post(PATH).headers(json).loginAs(user).json(body)
    disabled.assertStatus(404)
  })
})
