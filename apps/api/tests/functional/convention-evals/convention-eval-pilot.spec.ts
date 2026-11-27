/**
 * `node ace evals:pilot`'s steps, as the command calls them: the flag for the admin alone, the
 * pilot configuration, the refusals of `--run`, and one run through the route's start and the
 * job, with a scripted model and the sandboxes swapped (never E2B, never a provider).
 */
import app from '@adonisjs/core/services/app'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { MockLanguageModelV4 } from '@coreloom-uml/llm/testing'
import { test } from '@japa/runner'
import AgentConfig from '#app/agent-configs/models/agent-config'
import { heldReadyRules } from '#app/agent-configs/serializers/agent-config-serializer'
import ConventionEvalRun from '#app/convention-evals/models/convention-eval-run'
import {
  enablePilotFlag,
  PILOT_RULES,
  PilotRefusal,
  preparePilotConfig,
  runPilot,
} from '#app/convention-evals/services/eval-pilot'
import { isFeatureEnabled } from '#app/feature-flags/services/feature-flags'
import LanguageModels from '#app/llm/services/language-models'
import env from '#start/env'
import { freeLock, makeUser, useModel } from '#tests/helpers/convention-evals'
import { FakeEvalSandboxes } from '#tests/helpers/fake-eval-sandbox'
import { withDefaultFlags } from '#tests/helpers/feature-flags'

/** A model that commits once and says so, every trial. */
const COMMITS = () =>
  new MockLanguageModelV4({
    doGenerate: async (options) => {
      const usage = {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 10, text: 10, reasoning: undefined },
      }
      if (options.prompt.at(-1)?.role === 'tool') {
        return {
          content: [{ type: 'text', text: 'Done.' }],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
          warnings: [],
        }
      }
      return {
        content: [
          {
            type: 'tool-call',
            toolCallId: `call-${String(options.prompt.length)}`,
            toolName: 'run',
            input: JSON.stringify({ command: 'git commit -am "fix: sum"' }),
          },
        ],
        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        usage,
        warnings: [],
      }
    },
  })

async function asAdmin() {
  const admin = await makeUser()
  env.set('DEFAULT_ACCOUNT_EMAIL', admin.email)
  env.set('DEFAULT_ACCOUNT_PASSWORD', 'a-very-strong-passphrase')
  return admin
}

test.group('Convention tests - the pilot command', (group) => {
  group.each.setup(() => withDefaultFlags())
  group.each.setup(() => {
    const email = env.get('DEFAULT_ACCOUNT_EMAIL')
    const password = env.get('DEFAULT_ACCOUNT_PASSWORD')
    return () => {
      env.set('DEFAULT_ACCOUNT_EMAIL', email ?? '')
      env.set('DEFAULT_ACCOUNT_PASSWORD', password ?? '')
      app.container.restore(LanguageModels)
    }
  })

  test('turns the flag on for the admin alone, and prepares the configuration once', async ({
    assert,
  }) => {
    const other = await makeUser()
    const admin = await asAdmin()
    const lines: string[] = []
    await enablePilotFlag((line) => lines.push(line))
    assert.isTrue(await isFeatureEnabled(FeatureFlagKey.ConventionEvals, admin))
    assert.isFalse(await isFeatureEnabled(FeatureFlagKey.ConventionEvals, other))

    const id = await preparePilotConfig(() => {})
    assert.equal(await preparePilotConfig(() => {}), id)
    const config = await AgentConfig.findOrFail(id)
    assert.equal(config.userId, admin.id)
    assert.isNull(config.projectId)
    await config.load('readyRules')
    const held = heldReadyRules(config.readyRules).map(({ slot, rule }) => ({ slot, rule }))
    assert.sameDeepMembers(held, [...PILOT_RULES])
  })

  test('refuses a run while the flag is off, of another account, and on path I', async ({
    assert,
  }) => {
    const admin = await asAdmin()
    const id = await preparePilotConfig(() => {})
    const run = (kind: 'mistral' | 'anthropic', configId = id) =>
      runPilot({ configId, kind, model: 'unused', dry: true }, () => {})
    await assert.rejects(() => run('mistral'), PilotRefusal)

    await enablePilotFlag(() => {})
    const stranger = await makeUser()
    const theirs = await AgentConfig.create({
      userId: stranger.id,
      name: 'Theirs',
      targets: ['generic'],
      notes: null,
      revision: 1,
    })
    await assert.rejects(() => run('mistral', theirs.id), PilotRefusal)
    await assert.rejects(() => run('anthropic'), /blocked until #153/)
    assert.lengthOf(await ConventionEvalRun.query().where('userId', admin.id), 0)
  })

  test('runs one test through the route start and the job, and says what was left', async ({
    assert,
  }) => {
    const sandboxes = new FakeEvalSandboxes().install()
    const admin = await asAdmin()
    try {
      await enablePilotFlag(() => {})
      const id = await preparePilotConfig(() => {})
      useModel(COMMITS())
      const lines: string[] = []
      await runPilot(
        { configId: id, kind: 'mistral', model: 'mistral-small-2603', dry: false },
        (line) => lines.push(line),
      )
      const run = await ConventionEvalRun.query().where('userId', admin.id).firstOrFail()
      assert.equal(run.path, 'harness')
      assert.include(lines.join('\n'), 'job data keys: runId,provider')
      assert.include(lines.join('\n'), `status=${run.status}`)
      assert.include(lines.join('\n'), 'sandboxes left for the run: 0')
      assert.isTrue(lines.some((line) => /: success \d+\/\d+, compliance \d+\/\d+$/.test(line)))
    } finally {
      sandboxes.restore()
      await freeLock(admin.id)
    }
  })
})
