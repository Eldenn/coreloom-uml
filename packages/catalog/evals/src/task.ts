import type { AcceptedRule } from '../../src/index.ts'

/**
 * What the agent finds in the fixture besides its files: nothing of the conventions, AGENTS.md
 * and the pointer each tool reads it through, or every file the catalog renders with the Git
 * hooks turned on. The second against the first measures what the text does; the third against
 * the second, what the settings and hooks add.
 */
export const Condition = {
  None: 'none',
  Instructions: 'instructions',
  Full: 'full',
} as const

export type Condition = (typeof Condition)[keyof typeof Condition]

export const CONDITIONS = Object.values(Condition) as readonly Condition[]

/**
 * What the graded rule asks of this task: `applies` when the task makes the rule matter,
 * `idle` when it does not and doing what the rule is about is a change nobody asked for, `flip`
 * when the rule held goes against the usual habit (it applies too, from the other side).
 */
export const Polarity = {
  Applies: 'applies',
  Idle: 'idle',
  Flip: 'flip',
} as const

export type Polarity = (typeof Polarity)[keyof typeof Polarity]

export const Verdict = {
  Pass: 'pass',
  Fail: 'fail',
  /** The agent did not do the part the rule is about: it says nothing of the rule either way. */
  NotApplicable: 'not-applicable',
} as const

export type Verdict = (typeof Verdict)[keyof typeof Verdict]

export type Grade = { verdict: Verdict; reason: string }

/** The repository as the trial left it, and the commit it started from. */
export type FinalState = {
  root: string
  /** The fixture's only commit: everything after it is the agent's. */
  base: string
  /** The bare repository `origin` points at, as it was pushed to. */
  remote: string
}

/** Grades the final state alone: never the commands run nor the order they ran in. */
export type Grader = (state: FinalState) => Grade

/** A change made to the workspace the way an agent would, for the grader tests. */
export type Solution = (state: FinalState) => void

export type EvalTask = {
  /** kebab-case, unique: also the folder name of the task once exported. */
  id: string
  /** The rule graded, which the configuration holds in the `instructions` and `full` conditions. */
  rule: AcceptedRule
  /** Other rules the configuration holds, never graded by this task. */
  context?: readonly AcceptedRule[]
  polarity: Polarity
  /** What the agent is asked, in the words of a user who says nothing of the conventions. */
  instruction: string
  /** The fixture's files, committed once as its base commit. */
  files: Readonly<Record<string, string>>
  /** Whether the task itself was done, whatever the rule. */
  success: Grader
  /** Whether the rule was followed; `not-applicable` when the agent did not reach that part. */
  compliance: Grader
  /** Done and following the rule: both graders must pass on it. */
  reference: Solution
  /** Done but breaking the rule: `success` must pass and `compliance` must fail on it. */
  violation: Solution
}
