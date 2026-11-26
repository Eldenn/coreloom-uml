import app from '@adonisjs/core/services/app'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { DESIGN_BRIEF_INSTRUCTIONS } from '@coreloom-uml/llm'
import { toolCallingModel } from '@coreloom-uml/llm/testing'
import type { ApiClient } from '@japa/api-client'
import { test } from '@japa/runner'
import AssistantConversation from '#app/assistant/models/assistant-conversation'
import { updateFlag } from '#app/feature-flags/services/feature-flags'
import LanguageModels from '#app/llm/services/language-models'
import Project from '#app/projects/models/project'
import User from '#app/users/models/user'
import { withDefaultFlags } from '#tests/helpers/feature-flags'
import { saveTestLlmKey } from '#tests/helpers/llm-key'

const json = { accept: 'application/json' }
const ON = { enabled: true, rollout: 100, rules: [] }
const chat = {
  provider: { kind: 'mistral', model: 'mistral-small-latest' },
  apiKey: 'sk-fixture-design-brief',
  message: 'An online shop for about 10k customers, payments through Stripe.',
  locale: 'en',
  auto: true,
}
const STEPS_LINE = DESIGN_BRIEF_INSTRUCTIONS.split('\n')[0] ?? ''

async function setup(email: string, { design = true, actions = true } = {}) {
  const user = await User.create({ email, password: 'a-very-strong-passphrase' })
  await saveTestLlmKey(user)
  await updateFlag(FeatureFlagKey.DiagramAssistant, ON, user)
  if (actions) await updateFlag(FeatureFlagKey.AssistantActions, ON, user)
  if (design) await updateFlag(FeatureFlagKey.DesignRecords, ON, user)
  const conversation = await AssistantConversation.create({ userId: user.id, title: '' })
  const project = await Project.create({ userId: user.id, name: 'Shop' })
  return { user, conversation, project }
}

/** Sends one message with `body` to a model that answers with text; the model and the response. */
async function send(
  client: ApiClient,
  f: Awaited<ReturnType<typeof setup>>,
  body: Record<string, unknown>,
) {
  const model = toolCallingModel([{ text: 'How many orders a day?' }])
  app.container.swap(LanguageModels, () => {
    const fake = new LanguageModels()
    fake.create = () => model
    return fake
  })
  const response = await client
    .post(`/assistant/conversations/${f.conversation.id}/messages`)
    .headers(json)
    .loginAs(f.user)
    .json({ ...chat, ...body })
  const system = JSON.stringify(model.doGenerateCalls[0]?.prompt[0] ?? '')
  const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt.slice(1) ?? '')
  return { response, model, system, prompt }
}

test.group('Assistant - design brief', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.teardown(() => app.container.restore(LanguageModels))

  test('runs the loop with the brief steps, on the project as the page', async ({
    client,
    assert,
  }) => {
    const f = await setup('design-brief-on@example.com')
    const { response, system, prompt } = await send(client, f, {
      brief: { projectId: f.project.id },
    })
    response.assertStatus(200)
    assert.include(system, STEPS_LINE)
    assert.include(prompt, `kind=\\"project\\" id=\\"${f.project.id}\\"`)
    assert.equal(response.body().messages[1].content, 'How many orders a day?')

    const plain = await send(client, f, {})
    plain.response.assertStatus(200)
    assert.notInclude(plain.system, STEPS_LINE)
  })

  // A flag's state is the instance's, not the account's: one setup per test.
  for (const [name, flags] of [
    ['design-records', { design: false }],
    ['assistant-actions', { actions: false }],
  ] as const) {
    test(`refused without ${name}`, async ({ client, assert }) => {
      const f = await setup(`design-brief-no-${name}@example.com`, flags)
      const { response, model } = await send(client, f, { brief: { projectId: f.project.id } })
      response.assertStatus(404)
      assert.lengthOf(model.doGenerateCalls, 0)
    })
  }

  test("refused for a project that is not the caller's", async ({ client, assert }) => {
    const f = await setup('design-brief-mine@example.com')
    const other = await setup('design-brief-other@example.com')
    const { response, model } = await send(client, f, { brief: { projectId: other.project.id } })
    response.assertStatus(404)
    assert.lengthOf(model.doGenerateCalls, 0)
    assert.lengthOf(await f.conversation.related('messages').query(), 0)
  })
})
