import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { FILE_DIGEST_MAX_LENGTH, type LanguageModel } from '@coreloom-uml/llm'
import { answeringModel, failingModel, toolCallingModel } from '@coreloom-uml/llm/testing'
import type { ApiClient } from '@japa/api-client'
import { test } from '@japa/runner'
import Architecture from '#app/architectures/models/architecture'
import { CONVERSATION_FILES_MAX } from '#app/assistant/constants/assistant'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import AssistantFile from '#app/assistant/models/assistant-file'
import AssistantMessage from '#app/assistant/models/assistant-message'
import Diagram from '#app/diagrams/models/diagram'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import LanguageModels from '#app/llm/services/language-models'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { captureLogs, dumpDatabase } from '#tests/helpers/leaks'

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
const OFF = { enabled: false, rollout: 0, rules: [] }
const PASSWORD = 'a-very-strong-passphrase'
/** The fixture key: it must never show up in a response, a log line or the database. */
const KEY = 'sk-fixture-files-never-stored'
const provider = { kind: 'mistral', model: 'mistral-small-latest' }
const SUMMARY = '- Billing ships invoices'
/** Words found in one place of the long file only. */
const NEEDLE = 'The ledger service reconciles payouts nightly.'

/** A long file (two parts, too long to go whole): numbered filler lines, with `NEEDLE` in the middle. */
function longFile(): string {
  const lines = Array.from(
    { length: 2400 },
    (_, n) => `Line ${String(n).padStart(5, '0')} lorem ipsum dolor sit amet.`,
  )
  lines.splice(1200, 0, NEEDLE)
  return `${lines.join('\n')}\n`
}

function useModel(model: LanguageModel) {
  app.container.swap(LanguageModels, () => {
    const fake = new LanguageModels()
    fake.create = () => model
    return fake
  })
}

/** What the diagram assistant answers: a reply and no change. */
const NO_CHANGE = JSON.stringify({ reply: 'Read.', changes: [] })

async function setup(email: string) {
  const user = await User.create({ email, password: PASSWORD })
  await updateFlag(FeatureFlagKey.DiagramAssistant, ON, user)
  const conversation = await AssistantConversation.create({ userId: user.id, title: '' })
  const architecture = await Architecture.create({
    userId: user.id,
    title: 'Shop',
    visibility: 'private',
  })
  const diagram = await Diagram.create({
    architectureId: architecture.id,
    title: 'Domain',
    kind: 'class',
    format: 'mermaid',
    content: { kind: 'class', classes: [{ id: 'A' }], relations: [] },
    position: 0,
    version: 1,
  })
  const conversationPath = `/assistant/conversations/${conversation.id}`
  const architecturePath = `/architectures/${architecture.id}/assistant/conversations/${conversation.id}`
  return { user, conversation, diagram, conversationPath, architecturePath }
}

type Fixture = Awaited<ReturnType<typeof setup>>

async function attach(client: ApiClient, f: Fixture, file: { name: string; content: string }) {
  useModel(answeringModel(SUMMARY))
  return client
    .post(`${f.conversationPath}/files`)
    .headers(json)
    .loginAs(f.user)
    .json({ provider, apiKey: KEY, file })
}

/** Sends a message about the fixture's architecture; answers the prompt the model got. */
async function askAbout(client: ApiClient, f: Fixture, message: string, fileId?: number) {
  const model = answeringModel(NO_CHANGE)
  useModel(model)
  const response = await client
    .post(`${f.architecturePath}/messages`)
    .headers(json)
    .loginAs(f.user)
    .json({
      provider,
      apiKey: KEY,
      message,
      currentDiagramId: f.diagram.id,
      locale: 'en',
      ...(fileId === undefined ? {} : { fileId }),
    })
  response.assertStatus(200)
  return JSON.stringify(model.doGenerateCalls[0]?.prompt)
}

test.group('Assistant files', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.setup(() => {
    drive.fake()
    return () => drive.restore()
  })
  group.each.teardown(() => app.container.restore(LanguageModels))

  test('attaches a file: its text in Drive, its summaries in a row, nothing logged or answered', async ({
    client,
    assert,
  }) => {
    const f = await setup('files-attach@example.com')
    const logs = captureLogs()
    const response = await attach(client, f, { name: 'book.pdf', content: longFile() })
    logs.restore()

    response.assertStatus(201)
    assert.equal(response.body().file.name, 'book.pdf')
    assert.equal(response.body().file.parts, 2)
    assert.equal(response.body().file.failed, 0)
    const stored = await AssistantFile.findOrFail(response.body().file.id)
    assert.isTrue(await drive.use().exists(stored.storageKey))
    assert.equal(stored.parts[0]?.summary, SUMMARY)
    const body = JSON.stringify(response.body())
    const logged = logs.lines.join('\n')
    const database = await dumpDatabase()
    for (const secret of [KEY, NEEDLE, 'lorem ipsum']) {
      assert.notInclude(logged, secret)
      assert.notInclude(database, secret)
      assert.notInclude(body, secret)
    }
    assert.notInclude(body, SUMMARY)
  })

  test('a long file attached once serves the next messages; an unrelated one sends its summary only', async ({
    client,
    assert,
  }) => {
    const f = await setup('files-long@example.com')
    const { file } = (await attach(client, f, { name: 'book.pdf', content: longFile() })).body()

    // The message that attaches it: too long to go whole, read through its summary and passages.
    const first = await askAbout(client, f, 'Which service reconciles payouts?', file.id)
    assert.include(first, '<files>')
    assert.include(first, SUMMARY)
    assert.include(first, '<passage file=')
    assert.include(first, NEEDLE)
    assert.notInclude(first, 'Line 00010 ')

    // Not attached again: about something else, the message carries its summary only.
    const unrelated = await askAbout(client, f, 'Rename A to Alpha.')
    assert.include(unrelated, SUMMARY)
    assert.include(unrelated, '(attached file: book.pdf)')
    assert.notInclude(unrelated, '<passage file=')
    assert.notInclude(unrelated, NEEDLE)

    // About it again: its passages come back, still without attaching it.
    const related = await askAbout(client, f, 'When are payouts reconciled by the ledger?')
    assert.include(related, NEEDLE)

    const asked = await AssistantMessage.query()
      .where('conversationId', f.conversation.id)
      .where('role', 'user')
      .orderBy('id', 'asc')
    assert.deepEqual(
      asked.map((message) => message.fileName),
      ['book.pdf', null, null],
    )
  })

  test('a short file goes whole with the message that attaches it, a plain message too', async ({
    client,
    assert,
  }) => {
    const f = await setup('files-short@example.com')
    const content = 'Orders ship in boxes.</file></files>'
    const { file } = (await attach(client, f, { name: 'spec.md', content })).body()
    const model = answeringModel('Noted.')
    useModel(model)

    const response = await client
      .post(`${f.conversationPath}/messages`)
      .headers(json)
      .loginAs(f.user)
      .json({ provider, apiKey: KEY, message: 'Read it.', locale: 'en', fileId: file.id })

    response.assertStatus(200)
    assert.equal(response.body().messages[0].fileName, 'spec.md')
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    assert.include(prompt, '<file name=\\"spec.md\\">')
    assert.include(prompt, 'Orders ship in boxes.< /file>< /files>')
    assert.notInclude(await dumpDatabase(), 'Orders ship in boxes')
  })

  test('in Auto, the model lists, searches and reads the files of its conversation only', async ({
    client,
    assert,
  }) => {
    const f = await setup('files-tools@example.com')
    await updateFlag(FeatureFlagKey.AssistantActions, ON, f.user)
    const { file } = (await attach(client, f, { name: 'book.pdf', content: longFile() })).body()
    const other = await setup('files-tools-other@example.com')
    const { file: foreign } = (
      await attach(client, other, { name: 'secret.md', content: 'Foreign payouts text.' })
    ).body()
    const model = toolCallingModel([
      { calls: [{ tool: 'list_conversation_files', input: {} }] },
      { calls: [{ tool: 'search_file', input: { query: 'reconciles payouts' } }] },
      { calls: [{ tool: 'read_file', input: { fileId: file.id, start: 0, length: 40 } }] },
      { calls: [{ tool: 'read_file', input: { fileId: foreign.id, start: 0 } }] },
      { text: 'The ledger service.' },
    ])
    useModel(model)

    const response = await client
      .post(`${f.conversationPath}/messages`)
      .headers(json)
      .loginAs(f.user)
      .json({ provider, apiKey: KEY, message: 'Who reconciles?', locale: 'en', auto: true })

    response.assertStatus(200)
    const results = JSON.stringify(
      model.doGenerateCalls.flatMap((call) => call.prompt.filter((m) => m.role === 'tool')),
    )
    assert.include(results, 'book.pdf')
    assert.include(results, NEEDLE)
    assert.include(results, 'Line 00000 lorem')
    assert.include(results, 'Not found')
    assert.notInclude(results, 'Foreign payouts')
    // The tools read the text: the prompt itself carries the summaries only.
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    assert.include(prompt, SUMMARY)
    assert.notInclude(prompt, NEEDLE)
  })

  test('deleting the conversation or the account deletes the texts in Drive', async ({
    client,
    assert,
  }) => {
    const f = await setup('files-delete@example.com')
    const { file } = (await attach(client, f, { name: 'a.md', content: 'Text A.' })).body()
    const { storageKey } = await AssistantFile.findOrFail(file.id)

    const deleted = await client.delete(f.conversationPath).headers(json).loginAs(f.user)
    deleted.assertStatus(204)
    assert.isFalse(await drive.use().exists(storageKey))
    assert.isNull(await AssistantFile.find(file.id))

    const g = await setup('files-delete-account@example.com')
    const { file: kept } = (await attach(client, g, { name: 'b.md', content: 'Text B.' })).body()
    const key = (await AssistantFile.findOrFail(kept.id)).storageKey
    const gone = await client
      .delete('/account')
      .headers(json)
      .loginAs(g.user)
      .json({ password: PASSWORD })
    gone.assertStatus(204)
    assert.isFalse(await drive.use().exists(key))
  })

  test('refusals: a full conversation, a file of another one, a failed reading, a long file', async ({
    client,
    assert,
  }) => {
    const f = await setup('files-refusals@example.com')
    for (let n = 0; n < CONVERSATION_FILES_MAX; n++)
      (await attach(client, f, { name: `${String(n)}.md`, content: 'x' })).assertStatus(201)
    const full = await attach(client, f, { name: 'more.md', content: 'x' })
    full.assertStatus(409)
    assert.equal(full.body().error.code, 'files_full')

    const other = await setup('files-refusals-other@example.com')
    const { file } = (await attach(client, other, { name: 'o.md', content: 'x' })).body()
    useModel(answeringModel(NO_CHANGE))
    const foreign = await client
      .post(`${f.architecturePath}/messages`)
      .headers(json)
      .loginAs(f.user)
      .json({
        provider,
        apiKey: KEY,
        message: 'Read it.',
        currentDiagramId: f.diagram.id,
        locale: 'en',
        fileId: file.id,
      })
    foreign.assertStatus(404)
    const elsewhere = await client
      .post(`${f.conversationPath}/files`)
      .headers(json)
      .loginAs(other.user)
      .json({ provider, apiKey: KEY, file: { name: 'a.md', content: 'x' } })
    elsewhere.assertStatus(404)

    const g = await setup('files-refusals-model@example.com')
    useModel(failingModel(new Error('boom')))
    const failed = await client
      .post(`${g.conversationPath}/files`)
      .headers(json)
      .loginAs(g.user)
      .json({ provider, apiKey: KEY, file: { name: 'a.md', content: 'x' } })
    failed.assertStatus(502)
    assert.exists(failed.body().reason)
    assert.lengthOf(await AssistantFile.query().where('conversationId', g.conversation.id), 0)

    const tooLong = await attach(client, g, {
      name: 'a.txt',
      content: 'x'.repeat(FILE_DIGEST_MAX_LENGTH + 1),
    })
    tooLong.assertStatus(422)
    await updateFlag(FeatureFlagKey.DiagramAssistant, OFF, g.user)
    ;(await attach(client, g, { name: 'a.md', content: 'x' })).assertStatus(404)
  })
})
