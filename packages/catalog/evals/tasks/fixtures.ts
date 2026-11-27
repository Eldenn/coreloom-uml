import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { git } from '../src/git.ts'
import type { FinalState } from '../src/task.ts'

/**
 * The small JavaScript project the first tasks start from. Neutral on purpose: no lockfile, no
 * `packageManager` field and one commit named the way `git init` users usually name it, so the
 * fixture gives none of the graded conventions away.
 */
export const SUM_FIXTURE: Readonly<Record<string, string>> = {
  'package.json': `${JSON.stringify(
    {
      name: 'fixture',
      version: '1.0.0',
      private: true,
      type: 'module',
      scripts: { test: 'node --test' },
    },
    null,
    2,
  )}\n`,
  'src/sum.js': [
    '/** The total of a list of numbers. */',
    'export function sum(values) {',
    '  let total = 0',
    '  for (let index = 1; index < values.length; index++) total += values[index]',
    '  return total',
    '}',
    '',
  ].join('\n'),
  'test/sum.test.js': [
    "import assert from 'node:assert/strict'",
    "import { test } from 'node:test'",
    "import { sum } from '../src/sum.js'",
    '',
    "test('adds every value', () => {",
    '  assert.equal(sum([1, 2, 3]), 6)',
    '})',
    '',
  ].join('\n'),
}

/** What `sum` must do, checked on the folder `{{root}}` names; the agent never sees this file. */
export const SUM_HIDDEN_TEST = [
  "import assert from 'node:assert/strict'",
  "import { test } from 'node:test'",
  "const { sum } = await import('{{root}}/src/sum.js')",
  '',
  "test('sum', () => {",
  '  assert.equal(sum([1, 2, 3]), 6)',
  '  assert.equal(sum([5]), 5)',
  '  assert.equal(sum([]), 0)',
  '})',
  '',
].join('\n')

/** The fix the sum tasks ask for, as an agent would write it. */
export function fixSum(state: FinalState) {
  writeSum(state, '  return values.reduce((total, value) => total + value, 0)')
}

/** Half a fix: the first value counts now, but an empty list throws. */
export function halfFixSum(state: FinalState) {
  writeSum(state, '  return values.reduce((total, value) => total + value)')
}

function writeSum(state: FinalState, body: string) {
  writeFileSync(
    join(state.root, 'src/sum.js'),
    ['/** The total of a list of numbers. */', 'export function sum(values) {', body, '}', ''].join(
      '\n',
    ),
  )
}

/** Commits what is staged by name, as an agent following the conventions would. */
export function commit(state: FinalState, paths: readonly string[], message: string) {
  git(state.root, ['add', '--', ...paths])
  git(state.root, [
    'commit',
    '--quiet',
    '--no-verify',
    '--allow-empty-message',
    '--message',
    message,
  ])
}
