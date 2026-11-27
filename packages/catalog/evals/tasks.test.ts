/**
 * The graders of the convention evals, checked offline against solutions written by hand: on
 * each task's reference solution both graders pass, on its violating one the task is done but the
 * rule grader fails, and on an untouched workspace the task is not done. No agent runs and no
 * model is called here; the trials themselves run outside CI (see the decision record).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { acceptedProblem, findRuleGroup, RULE_PACKS } from '../src/index.ts'
import { git, gitEnv } from './src/git.ts'
import { Condition, Polarity, Verdict } from './src/task.ts'
import { createWorkspace } from './src/workspace.ts'
import { CONVENTIONAL_SUBJECT, commitMessagesConventional } from './tasks/commit-messages.ts'
import { EVAL_TASKS } from './tasks/index.ts'

const tmp = mkdtempSync(join(realpathSync(tmpdir()), 'coreloom-uml-evals-test-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

let trial = 0
const workspace = (task: (typeof EVAL_TASKS)[number], condition: Condition) => {
  trial += 1
  return createWorkspace(task, condition, mkdtempSync(join(tmp, `${trial}-`)))
}

describe('the tasks', () => {
  it('have unique kebab-case ids', () => {
    const ids = EVAL_TASKS.map((task) => task.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it.each(EVAL_TASKS)('$id grades a ready-made rule of the catalog', (task) => {
    for (const rule of [task.rule, ...(task.context ?? [])]) {
      const group = findRuleGroup(RULE_PACKS, rule.slot)
      expect(group, rule.slot).toBeDefined()
      if (group) expect(acceptedProblem(group, [rule])).toBeNull()
    }
  })

  it('come in pairs: each graded slot has a task where its rule acts and one where it must not or flips', () => {
    const slots = new Set(EVAL_TASKS.map((task) => task.rule.slot))
    for (const slot of slots) {
      const polarities = EVAL_TASKS.filter((task) => task.rule.slot === slot).map(
        (task) => task.polarity,
      )
      expect(polarities, slot).toContain(Polarity.Applies)
      expect(
        polarities.some((polarity) => polarity !== Polarity.Applies),
        slot,
      ).toBe(true)
    }
  })
})

describe.each(EVAL_TASKS)('$id', (task) => {
  it('is not done on the untouched fixture', () => {
    const state = workspace(task, Condition.Instructions)
    expect(task.success(state).verdict).not.toBe(Verdict.Pass)
  })

  it('passes both graders on its reference solution', () => {
    const state = workspace(task, Condition.Instructions)
    task.reference(state)
    expect(task.success(state)).toMatchObject({ verdict: Verdict.Pass })
    expect(task.compliance(state)).toMatchObject({ verdict: Verdict.Pass })
  })

  it('is done but breaks the rule on its violating solution', () => {
    const state = workspace(task, Condition.Instructions)
    task.violation(state)
    expect(task.success(state)).toMatchObject({ verdict: Verdict.Pass })
    expect(task.compliance(state)).toMatchObject({ verdict: Verdict.Fail })
  })
})

describe('the workspace', () => {
  const [task] = EVAL_TASKS
  if (!task) throw new Error('no task')
  const line = (path: string) => (root: string) =>
    existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : null

  it('holds no convention file without conventions', () => {
    const { root } = workspace(task, Condition.None)
    expect(git(root, ['ls-files'])).toBe(
      ['package.json', 'src/sum.js', 'test/sum.test.js'].join('\n'),
    )
  })

  it('holds AGENTS.md and the pointers to it, and nothing a tool enforces, with the instructions only', () => {
    const { root } = workspace(commitMessagesConventional, Condition.Instructions)
    expect(line('AGENTS.md')(root)).toContain('Conventional Commits')
    expect(line('CLAUDE.md')(root)).toContain('@AGENTS.md')
    expect(existsSync(join(root, '.githooks'))).toBe(false)
    expect(() => git(root, ['config', 'core.hooksPath'])).toThrow()
  })

  it('turns the rendered hooks on in the full condition', () => {
    const state = workspace(commitMessagesConventional, Condition.Full)
    expect(git(state.root, ['config', 'core.hooksPath'])).toBe('.githooks')
    // The base commit is the fixture's: the agent starts with nothing to push.
    expect(git(state.root, ['rev-parse', 'origin/main'])).toBe(state.base)
    commitMessagesConventional.violation(state)
    const refused = spawnSync(
      'git',
      ['commit', '--allow-empty', '--message', 'Count the first value in sum'],
      { cwd: state.root, env: gitEnv() },
    )
    expect(refused.status).not.toBe(0)
  })

  it('grades commit subjects as the rendered commit-msg hook checks them', () => {
    const { root } = workspace(commitMessagesConventional, Condition.Full)
    const hook = line('.githooks/commit-msg')(root) ?? ''
    expect(hook).toContain(`grep -Eq '${CONVENTIONAL_SUBJECT.source}'`)
  })

  it('starts from the same base commit on every machine', () => {
    expect(workspace(task, Condition.None).base).toBe(workspace(task, Condition.None).base)
  })
})
