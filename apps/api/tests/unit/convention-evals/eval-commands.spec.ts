import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProviderKind } from '@coreloom-uml/catalog'
import { Condition, createWorkspace, EVAL_TASKS, GRADER_ENTRY } from '@coreloom-uml/catalog/evals'
import { test } from '@japa/runner'
import {
  CONVENTION_EVAL_LIMITS,
  EvalAgent,
  EvalPath,
} from '#app/convention-evals/constants/convention-evals'
import { EVAL_PRICES } from '#app/convention-evals/constants/eval-prices'
import { EVAL_TEMPLATE, evalTemplateCommands } from '#app/convention-evals/constants/eval-sandbox'
import { SETUP, SHELL } from '#app/convention-evals/services/eval-commands'
import { costOf, priceOf } from '#app/convention-evals/services/eval-cost'
import { routeOf, tasksFor, testableRules } from '#app/convention-evals/services/eval-plan'
import { buildGraderArchive } from '#app/convention-evals/services/grader-bundle'
import { packWorkspace } from '#app/convention-evals/services/trial-sandbox'

/** Runs a fixed command line with this machine's bash, its variables only. */
function bash(command: string, envs: Record<string, string>) {
  return spawnSync('bash', ['-c', command], {
    env: { PATH: process.env.PATH, ...envs },
    encoding: 'utf8',
  })
}

test.group('Convention tests - paths and prices', () => {
  test('a saved Anthropic or OpenAI key drives its CLI; every other kind, the harness', ({
    assert,
  }) => {
    assert.deepEqual(routeOf(ProviderKind.Anthropic), {
      path: EvalPath.Cli,
      agent: EvalAgent.ClaudeCode,
      providerHost: 'api.anthropic.com',
    })
    assert.equal(routeOf(ProviderKind.OpenAI).agent, EvalAgent.Codex)
    for (const kind of [
      ProviderKind.ClaudeCode,
      ProviderKind.OpenAICodex,
      ProviderKind.Mistral,
      ProviderKind.Ollama,
      ProviderKind.OpenAICompatible,
    ]) {
      assert.equal(routeOf(kind).path, EvalPath.Harness, kind)
    }
  })

  test('prices a listed model, an unknown one as its provider most expensive, a subscription as its provider', ({
    assert,
  }) => {
    assert.deepEqual(
      priceOf(ProviderKind.Anthropic, 'claude-sonnet-5-5'),
      EVAL_PRICES.anthropic['claude-sonnet-5-5'],
    )
    assert.deepEqual(
      priceOf(ProviderKind.Anthropic, 'claude-next'),
      EVAL_PRICES.anthropic['claude-fable-5-1'],
    )
    assert.deepEqual(
      priceOf(ProviderKind.ClaudeCode, 'sonnet'),
      EVAL_PRICES.anthropic['claude-sonnet-5-5'],
    )
    assert.deepEqual(
      priceOf(ProviderKind.OpenAICodex, 'gpt-6.1-sol'),
      EVAL_PRICES.openai['gpt-6.1-sol'],
    )
    assert.isNull(priceOf(ProviderKind.Ollama, 'qwen3'))
    // The record's estimate for Claude Code: about $0.105 a trial.
    const trial = costOf(
      { input: 0, cachedInput: 198_000, cacheWrite: 22_000, output: 3000 },
      EVAL_PRICES.anthropic['claude-sonnet-5-5'],
    )
    assert.closeTo(trial, 0.1048, 0.0001)
  })

  test('the testable rules are those the tasks grade', ({ assert }) => {
    assert.deepEqual(
      testableRules()
        .map((rule) => `${rule.slot}:${rule.rule}`)
        .sort(),
      [...new Set(EVAL_TASKS.map((task) => `${task.rule.slot}:${task.rule.rule}`))].sort(),
    )
    assert.lengthOf(tasksFor([{ slot: 'tooling.package-manager', rule: 'pnpm' }]), 2)
    assert.lengthOf(tasksFor([{ slot: 'tooling.package-manager', rule: 'npm' }]), 0)
  })

  test('the template pins Node by version and checksum', ({ assert }) => {
    const commands = evalTemplateCommands().join('\n')
    assert.include(commands, `v${EVAL_TEMPLATE.node.version}`)
    assert.include(commands, EVAL_TEMPLATE.node.sha256)
    assert.include(commands, `pnpm@${EVAL_TEMPLATE.pnpm}`)
  })
})

test.group('Convention tests - the sandbox command lines', (group) => {
  const tmp = mkdtempSync(join(realpathSync(tmpdir()), 'coreloom-uml-eval-commands-'))
  group.teardown(() => rmSync(tmp, { recursive: true, force: true }))

  test('SETUP unpacks a workspace and points origin at it; SHELL runs one command, capped', async ({
    assert,
  }) => {
    const task = EVAL_TASKS[0] as (typeof EVAL_TASKS)[number]
    const built = join(tmp, 'built')
    mkdirSync(built)
    const state = createWorkspace(task, Condition.None, built, {})
    const archive = join(tmp, 'trial.tgz')
    writeFileSync(archive, await packWorkspace(state, join(tmp, 'stage')))
    const envs = { TRIAL_ROOT: join(tmp, 'sandbox', 'trial'), TRIAL_ARCHIVE: archive }

    const setup = bash(SETUP, envs)
    assert.equal(setup.status, 0, setup.stderr)
    const remote = bash(SHELL, { ...envs, SHELL_COMMAND: 'git remote get-url origin' })
    assert.equal(remote.stdout.trim(), join(envs.TRIAL_ROOT, 'origin.git'))

    // The command is a variable: nothing of it is read by the shell that starts the line.
    const quoted = bash(SHELL, { ...envs, SHELL_COMMAND: `echo "'; exit 7; '" ; exit 3` })
    assert.equal(quoted.status, 3)
    assert.include(quoted.stdout, "'; exit 7; '")

    const flood = bash(SHELL, { ...envs, SHELL_COMMAND: 'yes x | head -c 1000000' })
    assert.equal(flood.stdout.length, CONVENTION_EVAL_LIMITS.shellOutputMaxBytes)
  })

  test('the graders tarball runs on its own with Node, from source', async ({ assert }) => {
    const dir = join(tmp, 'run')
    mkdirSync(dir)
    const graderRoot = join(tmp, 'grader')
    mkdirSync(graderRoot)
    const archive = join(tmp, 'grader.tgz')
    writeFileSync(archive, await buildGraderArchive(dir))
    assert.equal(bash('tar -xzf "$A" -C "$G"', { A: archive, G: graderRoot }).status, 0)

    const task = EVAL_TASKS.find((item) => item.id.includes('commit')) ?? EVAL_TASKS[0]
    if (!task) throw new Error('no task')
    const parent = join(tmp, 'graded')
    mkdirSync(parent)
    const state = createWorkspace(task, Condition.None, parent, {})
    task.reference(state)
    const graded = spawnSync(
      process.execPath,
      [
        join(graderRoot, 'packages', 'catalog', GRADER_ENTRY),
        task.id,
        state.root,
        state.base,
        state.remote,
      ],
      { cwd: tmp, encoding: 'utf8', env: { PATH: process.env.PATH } },
    )
    assert.equal(graded.status, 0, graded.stderr)
    const grades = JSON.parse(graded.stdout)
    assert.equal(grades.success.verdict, 'pass')
    assert.equal(grades.compliance.verdict, 'pass')
    // No test file of the catalog travels with it.
    const listing = bash('tar -tzf "$A"', { A: archive }).stdout
    assert.notMatch(listing, /\.test\.ts$/m)
    assert.include(listing, 'node_modules/zod/package.json')
    assert.isAbove(readFileSync(archive).length, 0)
  })
})
