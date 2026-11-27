/**
 * The graders of the convention evals, checked offline against solutions written by hand: on
 * each task's reference solution and its alternatives both graders pass, on each of its violating
 * ones the task is done but the rule grader fails, on each half-done one the task is not done,
 * and on the untouched workspace the task is not done and the rule grader answers what the task
 * says. No agent runs and no model is called here; the trials themselves run outside CI (see the
 * decision record).
 */
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  acceptedProblem,
  CONVENTIONAL_SUBJECT_PATTERN,
  EXEMPT_SUBJECT_PREFIXES,
  findRuleGroup,
  RULE_PACKS,
} from '../src/index.ts'
import { git, gitEnv, NO_HOME } from './src/git.ts'
import { hiddenTest, newCommits, subjectOf } from './src/graders.ts'
import { Condition, type EvalTask, type NamedSolutions, Polarity, Verdict } from './src/task.ts'
import { createWorkspace } from './src/workspace.ts'
import { commitMessagesConventional, isConventionalSubject } from './tasks/commit-messages.ts'
import { EVAL_TASKS } from './tasks/index.ts'

const tmp = mkdtempSync(join(realpathSync(tmpdir()), 'coreloom-uml-evals-test-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

let trial = 0
const workspace = (task: EvalTask, condition: Condition) => {
  trial += 1
  return createWorkspace(task, condition, mkdtempSync(join(tmp, `${trial}-`)))
}

/** Every named solution of one kind, across the tasks, as `[task id, name, task, solution]`. */
const named = (pick: (task: EvalTask) => NamedSolutions) =>
  EVAL_TASKS.flatMap((task) =>
    Object.entries(pick(task)).map(([name, solution]) => [task.id, name, task, solution] as const),
  )

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

  it.each(EVAL_TASKS)('$id has violations and half-done solutions to check', (task) => {
    expect(Object.keys(task.violations).length).toBeGreaterThan(0)
    expect(Object.keys(task.incomplete).length).toBeGreaterThan(0)
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
  it('is not done on the untouched fixture, and grades the rule as the task says', () => {
    const state = workspace(task, Condition.Instructions)
    expect(task.success(state).verdict).not.toBe(Verdict.Pass)
    expect(task.compliance(state)).toMatchObject({ verdict: task.untouched })
  })

  it('passes both graders on its reference solution', () => {
    const state = workspace(task, Condition.Instructions)
    task.reference(state)
    expect(task.success(state)).toMatchObject({ verdict: Verdict.Pass })
    expect(task.compliance(state)).toMatchObject({ verdict: Verdict.Pass })
  })
})

describe('alternatives', () => {
  it.each(
    named((task) => task.alternatives),
  )('%s: %s passes both graders', (_id, _name, task, solution) => {
    const state = workspace(task, Condition.Instructions)
    solution(state)
    expect(task.success(state)).toMatchObject({ verdict: Verdict.Pass })
    expect(task.compliance(state)).toMatchObject({ verdict: Verdict.Pass })
  })
})

describe('violations', () => {
  it.each(
    named((task) => task.violations),
  )('%s: %s is done but breaks the rule', (_id, _name, task, solution) => {
    const state = workspace(task, Condition.Instructions)
    solution(state)
    expect(task.success(state)).toMatchObject({ verdict: Verdict.Pass })
    expect(task.compliance(state)).toMatchObject({ verdict: Verdict.Fail })
  })
})

describe('half-done solutions', () => {
  it.each(named((task) => task.incomplete))('%s: %s is not done', (_id, _name, task, solution) => {
    const state = workspace(task, Condition.Instructions)
    solution(state)
    expect(task.success(state).verdict).not.toBe(Verdict.Pass)
  })
})

describe('the hidden test', () => {
  const folder = mkdtempSync(join(tmp, 'hidden-'))

  it('fails when it runs past its timeout', () => {
    const source =
      "import { test } from 'node:test'\ntest('hangs', () => new Promise(() => setInterval(() => {}, 1000)))\n"
    const started = Date.now()
    expect(hiddenTest(folder, source, 300)).toMatchObject({ verdict: Verdict.Fail })
    expect(Date.now() - started).toBeLessThan(10_000)
  })

  it('fails when its runner is killed by a signal', () => {
    const source = "process.kill(process.ppid, 'SIGKILL')\n"
    expect(hiddenTest(folder, source)).toMatchObject({ verdict: Verdict.Fail })
  })

  it('passes when its test passes', () => {
    const source = "import { test } from 'node:test'\ntest('passes', () => {})\n"
    expect(hiddenTest(folder, source)).toMatchObject({ verdict: Verdict.Pass })
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
    const commit = (message: string) =>
      spawnSync('git', ['commit', '--allow-empty', '--message', message], {
        cwd: state.root,
        env: gitEnv(),
        encoding: 'utf8',
      })
    const refused = commit('Count the first value in sum')
    expect(refused.status).not.toBe(0)
    expect(refused.stderr).toContain('commit-msg: the subject must follow')
    expect(commit('fix(sum): x')).toMatchObject({ status: 0 })
  })

  it('renders the commit-msg hook from the subject pattern and the exemptions the grader reads', () => {
    const { root } = workspace(commitMessagesConventional, Condition.Full)
    const hook = line('.githooks/commit-msg')(root) ?? ''
    expect(hook).toContain(`grep -Eq '${CONVENTIONAL_SUBJECT_PATTERN}'`)
    for (const prefix of EXEMPT_SUBJECT_PREFIXES) expect(hook).toContain(`"${prefix}"*`)
  })

  it.skipIf(process.platform === 'win32')(
    'grades commit subjects as the rendered commit-msg hook checks them',
    () => {
      const { root } = workspace(commitMessagesConventional, Condition.Full)
      const file = join(root, '.git', 'TEST_MSG')
      const messages = [
        'fix(sum): count the first value',
        'feat!: drop the old flag',
        'Count the first value in sum',
        'Fix: count the first value',
        'fix:count the first value',
        "Merge branch 'topic'",
        'Bring the sum fix in',
        'Revert "fix: x"',
        'fixup! fix: x',
        'squash! fix: x',
        'amend! fix: x',
        'Mergeable: not a merge',
        '# A comment first\n\nfix: x',
        '# A comment first\nCount the first value',
        '\n\nfix: x after blank lines',
        '# ------------------------ >8 ------------------------\nfix: x below the scissors',
      ]
      for (const message of messages) {
        writeFileSync(file, `${message}\n`)
        const hook = spawnSync('sh', ['.githooks/commit-msg', file], { cwd: root })
        expect(isConventionalSubject(subjectOf(message)), message).toBe(hook.status === 0)
      }
    },
  )

  it('grades merge commits as the rendered commit-msg hook checks them', () => {
    const state = workspace(commitMessagesConventional, Condition.Full)
    const run = (args: readonly string[]) =>
      spawnSync('git', args, { cwd: state.root, env: gitEnv(), encoding: 'utf8' })
    expect(run(['switch', '--quiet', '--create', 'topic'])).toMatchObject({ status: 0 })
    commitMessagesConventional.reference(state)
    expect(run(['switch', '--quiet', 'main'])).toMatchObject({ status: 0 })

    const named = run(['merge', '--no-ff', '--message', 'Bring the sum fix in', 'topic'])
    expect(named.status).not.toBe(0)
    expect(named.stderr).toContain('commit-msg: the subject must follow')
    expect(isConventionalSubject('Bring the sum fix in')).toBe(false)
    expect(run(['merge', '--abort'])).toMatchObject({ status: 0 })

    expect(run(['merge', '--no-ff', '--no-edit', 'topic'])).toMatchObject({ status: 0 })
    expect(newCommits(state).map((item) => item.subject)).toContain("Merge branch 'topic'")
    expect(commitMessagesConventional.compliance(state)).toMatchObject({ verdict: Verdict.Pass })
  })

  it('starts from the same base commit on every machine', () => {
    expect(workspace(task, Condition.None).base).toBe(workspace(task, Condition.None).base)
  })

  it("grades HEAD without touching the repository's index", () => {
    const state = workspace(commitMessagesConventional, Condition.Instructions)
    commitMessagesConventional.reference(state)
    // A staged change to a file HEAD holds: a checkout of HEAD through this index would undo it.
    writeFileSync(join(state.root, 'test/sum.test.js'), '// Staged, not committed.\n')
    git(state.root, ['add', 'test/sum.test.js'])
    const staged = git(state.root, ['diff', '--cached', '--name-only'])
    expect(commitMessagesConventional.success(state)).toMatchObject({ verdict: Verdict.Pass })
    expect(git(state.root, ['diff', '--cached', '--name-only'])).toBe(staged)
    expect(staged).toBe('test/sum.test.js')
  })

  it("reads none of the machine's Git ignore or attributes", () => {
    const trap = mkdtempSync(join(tmp, 'home-'))
    for (const config of [join(trap, '.config', 'git'), join(trap, 'git')]) {
      mkdirSync(config, { recursive: true })
      writeFileSync(join(config, 'ignore'), 'CLAUDE.md\n')
      writeFileSync(join(config, 'attributes'), '*.js export-ignore\n')
    }
    const clean = workspace(commitMessagesConventional, Condition.Instructions)
    const saved = { HOME: process.env.HOME, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME }
    process.env.HOME = trap
    process.env.XDG_CONFIG_HOME = trap
    try {
      const state = workspace(commitMessagesConventional, Condition.Instructions)
      expect(git(state.root, ['ls-files'])).toContain('CLAUDE.md')
      expect(state.base).toBe(clean.base)
      commitMessagesConventional.reference(state)
      expect(commitMessagesConventional.success(state)).toMatchObject({ verdict: Verdict.Pass })
      // Git was given a home that does not exist, and none was created.
      expect(existsSync(NO_HOME)).toBe(false)
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })
})
