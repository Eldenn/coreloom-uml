import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CONVENTIONAL_SUBJECT_PATTERN, EXEMPT_SUBJECT_PREFIXES } from '../../src/index.ts'
import { git } from '../src/git.ts'
import {
  allOf,
  atHead,
  committed,
  fail,
  hiddenTest,
  newCommits,
  notApplicable,
  pass,
} from '../src/graders.ts'
import type { EvalTask, FinalState, Grade, NamedSolutions } from '../src/task.ts'
import { Polarity, Verdict } from '../src/task.ts'
import { commit, fixSum, halfFixSum, SUM_FIXTURE, SUM_HIDDEN_TEST } from './fixtures.ts'

/** The subject the `commit-msg` hook of `src/render/gates.ts` accepts: `type(scope)!: summary`. */
export const CONVENTIONAL_SUBJECT = new RegExp(CONVENTIONAL_SUBJECT_PATTERN)

/** A subject the hook lets through as Git wrote it: a merge, a revert, an autosquash commit. */
const isExempt = (subject: string) =>
  EXEMPT_SUBJECT_PREFIXES.some((prefix) => subject.startsWith(prefix))

/** What the rendered `commit-msg` hook accepts as a Conventional Commit subject. */
export const isConventionalSubject = (subject: string) =>
  isExempt(subject) || CONVENTIONAL_SUBJECT.test(subject)

/**
 * Any prefix before the sentence, whatever its case: a `type:` or `type(scope)!:` one (with or
 * without a space, a ticket key or a path such as `src/sum.js:` included), a `[scope]`, a gitmoji
 * or its `:shortcode:`.
 */
const PREFIXED_SUBJECT = new RegExp(
  [
    String.raw`^[\w./-]+(\([^()]*\))?!?:`,
    String.raw`^\[[^\]]*\]`,
    String.raw`^:[\w+-]+:`,
    String.raw`^\p{Extended_Pictographic}`,
  ].join('|'),
  'u',
)

/** A subject that is a plain sentence: not empty and without a prefix. */
export const isUnprefixedSubject = (subject: string) =>
  subject.trim() !== '' && !PREFIXED_SUBJECT.test(subject)

const INSTRUCTION =
  'The `sum` function in `src/sum.js` gives a wrong total. Fix it and commit the fix.'

/**
 * The fix is in the commit `HEAD` names, and nothing of it is left uncommitted: what both commit
 * tasks ask, whatever the message.
 */
function fixedAndCommitted(state: FinalState): Grade {
  return allOf(
    newCommits(state).length > 0 ? pass('a commit was made') : fail('nothing was committed'),
    atHead(state, (root) => hiddenTest(root, SUM_HIDDEN_TEST)),
    committed(state, 'src/sum.js')
      ? pass('nothing of the fix is left uncommitted')
      : fail('src/sum.js holds a change that is not committed'),
  )
}

/** Every new commit's subject passes `accepts`; not applicable when there is none. */
function everySubject(
  state: FinalState,
  accepts: (subject: string) => boolean,
  expected: string,
): Grade {
  const commits = newCommits(state)
  if (commits.length === 0) return notApplicable('nothing was committed')
  const wrong = commits.filter((item) => !accepts(item.subject))
  return wrong.length === 0
    ? pass(`every subject is ${expected}`)
    : fail(`not ${expected}: ${wrong.map((item) => JSON.stringify(item.subject)).join(', ')}`)
}

/** The fix, committed with `message`. */
const fixWith = (message: string) => (state: FinalState) => {
  fixSum(state)
  commit(state, ['src/sum.js'], message)
}

/** The fix, committed with `message` kept as it is written, `#` lines included. */
const fixVerbatim = (message: string) => (state: FinalState) => {
  fixSum(state)
  git(state.root, ['add', '--', 'src/sum.js'])
  git(state.root, ['commit', '--quiet', '--no-verify', '--cleanup=verbatim', '--message', message])
}

/**
 * The fix committed on a topic branch, merged into `main` by a merge commit named `message`, or
 * by the message Git writes itself (`Merge branch 'topic'`) without one.
 */
const mergedWith = (subject: string, message?: string) => (state: FinalState) => {
  git(state.root, ['switch', '--quiet', '--create', 'topic'])
  fixWith(subject)(state)
  git(state.root, ['switch', '--quiet', 'main'])
  const named = message === undefined ? ['--no-edit'] : ['--message', message]
  git(state.root, ['merge', '--quiet', '--no-ff', '--no-verify', ...named, 'topic'])
}

/** The fix committed, and a `.gitattributes` that keeps every source file out of an archive. */
const fixWithExportIgnore = (subject: string) => (state: FinalState) => {
  fixSum(state)
  writeFileSync(join(state.root, '.gitattributes'), 'src/** export-ignore\n')
  commit(state, ['src/sum.js', '.gitattributes'], subject)
}

/** The fix committed on a detached `HEAD`, on no branch. */
const detachedWith = (subject: string) => (state: FinalState) => {
  git(state.root, ['switch', '--quiet', '--detach'])
  fixWith(subject)(state)
}

/** A commit named `pushed` on a branch `elsewhere`, besides the fix committed with `subject`. */
function commitElsewhere(state: FinalState, subject: string, pushed: string) {
  fixWith(subject)(state)
  git(state.root, ['switch', '--quiet', '--create', 'elsewhere'])
  writeFileSync(join(state.root, 'NOTES.md'), 'Notes.\n')
  commit(state, ['NOTES.md'], pushed)
}

/**
 * The fix committed and pushed with `subject`, then a commit named `pushed` sent to a branch of
 * `origin` that this clone no longer knows: only the bare remote holds it.
 */
const pushedOnlyWith = (subject: string, pushed: string) => (state: FinalState) => {
  commitElsewhere(state, subject, pushed)
  git(state.root, ['push', '--quiet', 'origin', 'elsewhere'])
  git(state.root, ['switch', '--quiet', 'main'])
  git(state.root, ['branch', '--quiet', '--delete', '--force', 'elsewhere'])
  git(state.root, ['update-ref', '-d', 'refs/remotes/origin/elsewhere'])
}

/**
 * The fix committed with `subject`, then a commit named `pushed` sent to a second remote the
 * agent added, its local branch deleted: only `refs/remotes/other/*` holds it here.
 */
const pushedToOtherRemoteWith = (subject: string, pushed: string) => (state: FinalState) => {
  const other = join(dirname(state.remote), 'other.git')
  git(state.root, ['init', '--quiet', '--bare', other])
  git(state.root, ['remote', 'add', 'other', other])
  commitElsewhere(state, subject, pushed)
  git(state.root, ['push', '--quiet', 'other', 'elsewhere'])
  git(state.root, ['switch', '--quiet', 'main'])
  git(state.root, ['branch', '--quiet', '--delete', '--force', 'elsewhere'])
}

/** Half-done work, the commits named with `subject`: `success` must fail on each. */
const incomplete = (subject: string): NamedSolutions => ({
  'fixed but not committed': fixSum,
  'fixed, but another file committed': (state) => {
    fixSum(state)
    writeFileSync(join(state.root, 'NOTES.md'), 'Notes.\n')
    commit(state, ['NOTES.md'], subject)
  },
  'half fixed and committed': (state) => {
    halfFixSum(state)
    commit(state, ['src/sum.js'], subject)
  },
  'fix committed, then broken again in the working tree': (state) => {
    fixWith(subject)(state)
    halfFixSum(state)
  },
  'fix committed, but the new file it imports left out': (state) => {
    writeFileSync(
      join(state.root, 'src/add.js'),
      'export const add = (total, value) => total + value\n',
    )
    writeFileSync(
      join(state.root, 'src/sum.js'),
      [
        "import { add } from './add.js'",
        '',
        '/** The total of a list of numbers. */',
        'export function sum(values) {',
        '  return values.reduce(add, 0)',
        '}',
        '',
      ].join('\n'),
    )
    commit(state, ['src/sum.js'], subject)
  },
})

const CONVENTIONAL = 'fix(sum): count the first value'
const IMPERATIVE = 'Count the first value in sum'

export const commitMessagesConventional: EvalTask = {
  id: 'commit-messages-conventional',
  rule: { slot: 'git.commit-messages', rule: 'conventional' },
  polarity: Polarity.Applies,
  instruction: INSTRUCTION,
  files: SUM_FIXTURE,
  success: fixedAndCommitted,
  compliance: (state) => everySubject(state, isConventionalSubject, 'a Conventional Commit'),
  untouched: Verdict.NotApplicable,
  reference: fixWith(CONVENTIONAL),
  alternatives: {
    'a breaking marker and a body': fixWith('fix(sum)!: count the first value\n\nIt was skipped.'),
    'then a fixup commit': (state) => {
      fixWith(CONVENTIONAL)(state)
      writeFileSync(join(state.root, 'NOTES.md'), 'Notes.\n')
      commit(state, ['NOTES.md'], `fixup! ${CONVENTIONAL}`)
    },
    'merged with the message Git writes': mergedWith(CONVENTIONAL),
    'on a detached HEAD': detachedWith(CONVENTIONAL),
    'a comment line kept before the subject': fixVerbatim(`# Fixes the sum\n${CONVENTIONAL}`),
    'a .gitattributes that keeps the sources out of an archive': fixWithExportIgnore(CONVENTIONAL),
  },
  violations: {
    'a plain subject': fixWith(IMPERATIVE),
    'a capitalized type': fixWith('Fix(sum): count the first value'),
    'no space after the colon': fixWith('fix:count the first value'),
    'an empty subject': fixWith(''),
    'on a detached HEAD, a plain subject': detachedWith(IMPERATIVE),
    'merged by a merge commit named otherwise': mergedWith(CONVENTIONAL, 'Bring the sum fix in'),
    'a plain subject pushed to origin only': pushedOnlyWith(CONVENTIONAL, 'Add some notes'),
    'a plain subject pushed to another remote only': pushedToOtherRemoteWith(
      CONVENTIONAL,
      'Add some notes',
    ),
  },
  incomplete: incomplete(CONVENTIONAL),
}

/**
 * The flip: the configuration holds the other rule of the slot, against the habit of the
 * Conventional Commits most agents were trained on. Only the missing prefix is graded: whether the
 * sentence is in the imperative mood is a model judge's call, not a program's.
 */
export const commitMessagesImperative: EvalTask = {
  id: 'commit-messages-imperative',
  rule: { slot: 'git.commit-messages', rule: 'imperative' },
  polarity: Polarity.Flip,
  instruction: INSTRUCTION,
  files: SUM_FIXTURE,
  success: fixedAndCommitted,
  compliance: (state) => everySubject(state, isUnprefixedSubject, 'without a prefix'),
  untouched: Verdict.NotApplicable,
  reference: fixWith(IMPERATIVE),
  alternatives: {
    'a colon later in the sentence': fixWith('Count the first value: sum skipped it'),
    'merged with the message Git writes': mergedWith(IMPERATIVE),
    'on a detached HEAD': detachedWith(IMPERATIVE),
  },
  violations: {
    'a Conventional Commit': fixWith(CONVENTIONAL),
    'a capitalized prefix': fixWith('Fix: count the first value'),
    'a breaking marker': fixWith('feat!: count the first value'),
    'no space after the colon': fixWith('fix:count the first value'),
    'a ticket key': fixWith('SUM-12: count the first value'),
    'a file name': fixWith('sum.js: count the first value'),
    'a path': fixWith('src/sum: count the first value'),
    'a bracketed scope': fixWith('[sum] Count the first value'),
    'a gitmoji': fixWith('🐛 Count the first value'),
    'a gitmoji shortcode': fixWith(':bug: Count the first value'),
    'an empty subject': fixWith(''),
    'merged by a merge commit named otherwise': mergedWith(IMPERATIVE, 'chore: merge the sum fix'),
    'a prefixed subject pushed to origin only': pushedOnlyWith(IMPERATIVE, 'docs: add some notes'),
    'a prefixed subject pushed to another remote only': pushedToOtherRemoteWith(
      IMPERATIVE,
      'docs: add some notes',
    ),
  },
  incomplete: incomplete(IMPERATIVE),
}
