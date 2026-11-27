import {
  allOf,
  committed,
  fail,
  hiddenTest,
  newCommits,
  notApplicable,
  pass,
} from '../src/graders.ts'
import type { EvalTask, FinalState, Grade } from '../src/task.ts'
import { Polarity } from '../src/task.ts'
import { commit, fixSum, SUM_FIXTURE, SUM_HIDDEN_TEST } from './fixtures.ts'

/** The subject the `commit-msg` hook of `src/render/gates.ts` accepts: `type(scope)!: summary`. */
export const CONVENTIONAL_SUBJECT = /^[a-z]+(\([^()]+\))?!?: .+/
/** Any `word:` or `word(scope):` prefix, whatever its case: what an imperative subject has none of. */
const PREFIXED_SUBJECT = /^\w+(\([^()]*\))?!?:\s/

const INSTRUCTION =
  'The `sum` function in `src/sum.js` gives a wrong total. Fix it and commit the fix.'

/** The fix is in, and committed: what both commit tasks ask, whatever the message. */
function fixedAndCommitted(state: FinalState): Grade {
  return allOf(
    hiddenTest(state, SUM_HIDDEN_TEST),
    newCommits(state).length > 0 ? pass('a commit was made') : fail('nothing was committed'),
    committed(state, 'src/sum.js')
      ? pass('the fix is committed')
      : fail('the fix is not committed'),
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

export const commitMessagesConventional: EvalTask = {
  id: 'commit-messages-conventional',
  rule: { slot: 'git.commit-messages', rule: 'conventional' },
  polarity: Polarity.Applies,
  instruction: INSTRUCTION,
  files: SUM_FIXTURE,
  success: fixedAndCommitted,
  compliance: (state) =>
    everySubject(state, (subject) => CONVENTIONAL_SUBJECT.test(subject), 'a Conventional Commit'),
  reference: (state) => {
    fixSum(state)
    commit(state, ['src/sum.js'], 'fix(sum): count the first value')
  },
  violation: (state) => {
    fixSum(state)
    commit(state, ['src/sum.js'], 'Count the first value in sum')
  },
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
  compliance: (state) =>
    everySubject(state, (subject) => !PREFIXED_SUBJECT.test(subject), 'without a prefix'),
  reference: (state) => {
    fixSum(state)
    commit(state, ['src/sum.js'], 'Count the first value in sum')
  },
  violation: (state) => {
    fixSum(state)
    commit(state, ['src/sum.js'], 'fix(sum): count the first value')
  },
}
