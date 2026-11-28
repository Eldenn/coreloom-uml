import { test } from '@japa/runner'
import ConventionEvalRun from '#app/convention-evals/models/convention-eval-run'
import ConventionEvalSetting from '#app/convention-evals/models/convention-eval-setting'
import User from '#app/users/models/user'
import env from '#start/env'
import {
  freeLock,
  json,
  makeConfig,
  makeUser,
  start,
  turnOn,
} from '#tests/helpers/convention-evals'
import { FakeEvalSandboxes } from '#tests/helpers/fake-eval-sandbox'
import { withDefaultFlags } from '#tests/helpers/feature-flags'

/** The instance's cap of a convention test, set by the admin and read by every new run. */

const ADMIN = 'convention-evals-admin@example.com'

async function admin() {
  return (
    (await User.findBy('email', ADMIN)) ??
    User.create({ email: ADMIN, password: 'a-very-strong-passphrase' })
  )
}

test.group('Admin: convention test cap', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.setup(() => {
    env.set('DEFAULT_ACCOUNT_EMAIL', ADMIN)
    env.set('DEFAULT_ACCOUNT_PASSWORD', 'the-default-passphrase')
    return async () => {
      env.set('DEFAULT_ACCOUNT_EMAIL', '')
      env.set('DEFAULT_ACCOUNT_PASSWORD', '')
      await ConventionEvalSetting.query().delete()
    }
  })

  test('is for the admin only, and 404 while the flag is off', async ({ client }) => {
    const owner = await admin()
    ;(await client.get('/admin/convention-evals').headers(json)).assertStatus(401)
    ;(await client.get('/admin/convention-evals').headers(json).loginAs(owner)).assertStatus(404)
    await turnOn(owner)
    const user = await makeUser()
    ;(await client.get('/admin/convention-evals').headers(json).loginAs(user)).assertStatus(404)
    ;(
      await client.put('/admin/convention-evals').headers(json).json({ capUsd: 20 }).loginAs(user)
    ).assertStatus(404)
  })

  test('answers the default, saves a cap within its bounds and refuses one outside', async ({
    client,
    assert,
  }) => {
    const owner = await admin()
    await turnOn(owner)
    const put = (capUsd: unknown) =>
      client.put('/admin/convention-evals').headers(json).json({ capUsd }).loginAs(owner)

    const shown = await client.get('/admin/convention-evals').headers(json).loginAs(owner)
    shown.assertStatus(200)
    assert.deepEqual(shown.body(), { capUsd: 5, minCapUsd: 1, maxCapUsd: 100 })
    ;(await put(0.5)).assertStatus(422)
    ;(await put(101)).assertStatus(422)
    ;(await put('a lot')).assertStatus(422)

    const saved = await put(20)
    saved.assertStatus(200)
    assert.equal(saved.body().capUsd, 20)
    ;(await put(12.5)).assertStatus(200)
    const again = await client.get('/admin/convention-evals').headers(json).loginAs(owner)
    assert.equal(again.body().capUsd, 12.5)
    assert.lengthOf(await ConventionEvalSetting.all(), 1)
  })

  test('a new plan and a new run take the saved cap', async ({ client, assert }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    const owner = await admin()
    await turnOn(owner)
    const user = await makeUser()
    try {
      const configId = await makeConfig(client, user, 'commits')
      ;(
        await client
          .put('/admin/convention-evals')
          .headers(json)
          .json({ capUsd: 20 })
          .loginAs(owner)
      ).assertStatus(200)

      const plan = await client
        .get(`/agent-configs/${configId}/evals/plan?kind=mistral&model=mistral-small-2603`)
        .headers(json)
        .loginAs(user)
      plan.assertStatus(200)
      assert.equal(plan.body().capUsd, 20)

      const { response } = await start(client, user, configId)
      response.assertStatus(202)
      const run = await ConventionEvalRun.findOrFail(response.body().runId)
      assert.equal(run.capUsd, 20)
    } finally {
      await freeLock(user.id)
      sandboxes.restore()
    }
  })
})
