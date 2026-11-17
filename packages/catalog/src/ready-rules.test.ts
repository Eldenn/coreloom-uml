import { describe, expect, it } from 'vitest'
import { acceptedLines, acceptedProblem, isAppliedRule, ruleTitle } from './ready-rules.ts'
import {
  LINE_VALUE_MAX_LENGTH,
  RULE_VALUE_MAX_LENGTH,
  type RuleGroup,
  ruleGroupSchema,
} from './schemas.ts'

const label = { en: 'Label', fr: 'Libellé' }

/** Holds one rule; the last one takes a text, and the group adds a line of its own. */
const one: RuleGroup = {
  slot: 'react.state',
  section: 'React',
  label,
  pick: 'one',
  rules: [
    { id: 'zustand', lines: ['State lives in Zustand stores.'] },
    { id: 'redux', label: { en: 'Redux', fr: 'Redux (fr)' }, lines: [] },
    {
      id: 'other',
      lines: ['State lives in {value}.', 'Follow the {value} documentation.'],
      input: true,
    },
  ],
  lines: ['Do not add a state library besides {value}.'],
}

/** Holds several rules, except `none`, which stands alone. */
const many: RuleGroup = {
  slot: 'testing.levels',
  section: 'Testing',
  label,
  pick: 'many',
  rules: [
    { id: 'unit', lines: ['Write unit tests.'] },
    { id: 'e2e', lines: ['Write end-to-end tests.', 'Run them before handing back.'] },
    { id: 'none', lines: ['Write no test unless asked to.'], alone: true },
  ],
  lines: ['Never delete a failing test.'],
}

describe('the fixture groups', () => {
  it.each([one, many])('pass the schema', (group) => {
    expect(ruleGroupSchema.safeParse(group).success).toBe(true)
  })
})

describe('acceptedProblem', () => {
  it('accepts no rule, one rule, and several rules of a `many` group', () => {
    expect(acceptedProblem(one, [])).toBeNull()
    expect(acceptedProblem(one, [{ rule: 'zustand' }])).toBeNull()
    expect(acceptedProblem(one, [{ rule: 'zustand', value: null }])).toBeNull()
    expect(acceptedProblem(one, [{ rule: 'other', value: 'MobX' }])).toBeNull()
    expect(acceptedProblem(many, [{ rule: 'e2e' }, { rule: 'unit' }])).toBeNull()
    expect(acceptedProblem(many, [{ rule: 'none' }])).toBeNull()
  })

  it('refuses a rule the group does not have', () => {
    expect(acceptedProblem(one, [{ rule: 'mobx' }])).toBe('Unknown rule: mobx')
    expect(acceptedProblem(many, [{ rule: 'unit' }, { rule: 'zustand' }])).toBe(
      'Unknown rule: zustand',
    )
  })

  it('refuses a rule listed twice', () => {
    expect(acceptedProblem(many, [{ rule: 'unit' }, { rule: 'unit' }])).toBe('unit is listed twice')
  })

  it('refuses two rules of a group that holds one', () => {
    expect(acceptedProblem(one, [{ rule: 'zustand' }, { rule: 'redux' }])).toBe(
      'This group holds one rule',
    )
  })

  it('refuses a rule that stands alone next to another, in either order', () => {
    expect(acceptedProblem(many, [{ rule: 'none' }, { rule: 'unit' }])).toBe(
      'none cannot be combined',
    )
    expect(acceptedProblem(many, [{ rule: 'unit' }, { rule: 'none' }])).toBe(
      'none cannot be combined',
    )
  })

  it('refuses an `input` rule without a text, and one with a text that is too long', () => {
    for (const value of [undefined, null, '', ' \n\t']) {
      expect(acceptedProblem(one, [{ rule: 'other', value }])).toBe('other needs a text')
    }
    const longest = 'x'.repeat(RULE_VALUE_MAX_LENGTH)
    expect(acceptedProblem(one, [{ rule: 'other', value: longest }])).toBeNull()
    expect(acceptedProblem(one, [{ rule: 'other', value: `${longest}x` }])).toBe(
      'Expected at most 500 characters',
    )
  })

  it('refuses a text on a rule that takes none', () => {
    expect(acceptedProblem(one, [{ rule: 'zustand', value: 'MobX' }])).toBe('zustand takes no text')
    expect(acceptedProblem(one, [{ rule: 'zustand', value: '' }])).toBe('zustand takes no text')
  })
})

describe('acceptedLines', () => {
  it('writes each held rule’s lines in the group’s order, then the group’s once', () => {
    expect(acceptedLines(many, [{ rule: 'e2e' }, { rule: 'unit' }])).toEqual([
      { rule: 'unit', text: 'Write unit tests.' },
      { rule: 'e2e', text: 'Write end-to-end tests.' },
      { rule: 'e2e', text: 'Run them before handing back.' },
      { rule: 'e2e', text: 'Never delete a failing test.' },
    ])
    expect(acceptedLines(many, [{ rule: 'none' }]).map((line) => line.text)).toEqual([
      'Write no test unless asked to.',
      'Never delete a failing test.',
    ])
  })

  it('writes the rule’s id for `{value}` when the rule takes no text', () => {
    expect(acceptedLines(one, [{ rule: 'zustand' }])).toEqual([
      { rule: 'zustand', text: 'State lives in Zustand stores.' },
      { rule: 'zustand', text: 'Do not add a state library besides zustand.' },
    ])
    // A rule without a line of its own still writes its group's.
    expect(acceptedLines(one, [{ rule: 'redux' }])).toEqual([
      { rule: 'redux', text: 'Do not add a state library besides redux.' },
    ])
  })

  it('writes the typed text for `{value}`, on one line, escaped and without markers', () => {
    const value = 'Mob*X*\n<b>`now`</b> coreloom-uml:end'
    const filled = 'Mob\\*X\\* \\<b\\>\\`now\\`\\</b\\> coreloom-uml end'
    expect(acceptedLines(one, [{ rule: 'other', value }])).toEqual([
      { rule: 'other', text: `State lives in ${filled}.` },
      { rule: 'other', text: `Follow the ${filled} documentation.` },
      { rule: 'other', text: `Do not add a state library besides ${filled}.` },
    ])
  })

  it('cuts the typed text to 200 characters', () => {
    const value = 'x'.repeat(RULE_VALUE_MAX_LENGTH)
    const [first] = acceptedLines(one, [{ rule: 'other', value }])
    expect(first?.text).toBe(`State lives in ${'x'.repeat(LINE_VALUE_MAX_LENGTH - 1)}….`)
  })

  it('writes nothing without a rule, and nothing when the rules cannot be held together', () => {
    expect(acceptedLines(one, [])).toEqual([])
    expect(acceptedLines(many, [])).toEqual([])
    expect(acceptedLines(one, [{ rule: 'zustand' }, { rule: 'redux' }])).toEqual([])
    expect(acceptedLines(many, [{ rule: 'unit' }, { rule: 'none' }])).toEqual([])
    expect(acceptedLines(many, [{ rule: 'unit' }, { rule: 'mobx' }])).toEqual([])
    expect(acceptedLines(one, [{ rule: 'other' }])).toEqual([])
    expect(acceptedLines(one, [{ rule: 'zustand', value: 'MobX' }])).toEqual([])
  })
})

describe('ruleTitle', () => {
  it('is the label, else the rule’s first line, else the group’s', () => {
    const [zustand, redux] = one.rules
    if (!zustand || !redux) throw new Error('The fixture group lost a rule')
    expect(ruleTitle(one, redux)).toEqual({ en: 'Redux', fr: 'Redux (fr)' })
    expect(ruleTitle(one, zustand)).toEqual({
      en: 'State lives in Zustand stores.',
      fr: 'State lives in Zustand stores.',
    })
    expect(ruleTitle(one, { id: 'redux', lines: [] }).en).toBe(
      'Do not add a state library besides {value}.',
    )
  })
})

describe('isAppliedRule', () => {
  it('is true for every rule of a slot that is applied whole', () => {
    expect(isAppliedRule('tooling.checks', 'run')).toBe(true)
    expect(isAppliedRule('workflow.autonomy', 'disagree')).toBe(true)
    expect(isAppliedRule('security.network', 'open')).toBe(true)
  })

  it('is true only for the listed rules of the other applied slots', () => {
    expect(isAppliedRule('git.commit-messages', 'conventional')).toBe(true)
    expect(isAppliedRule('git.commit-messages', 'imperative')).toBe(false)
    expect(isAppliedRule('git.attribution', 'agree')).toBe(true)
    expect(isAppliedRule('git.attribution', 'disagree')).toBe(false)
    expect(isAppliedRule('security.sandbox', 'container')).toBe(true)
    expect(isAppliedRule('security.sandbox', 'host')).toBe(false)
  })

  it('is false for a slot that only writes lines, an unknown slot and an inherited key', () => {
    expect(isAppliedRule('typescript.any', 'agree')).toBe(false)
    expect(isAppliedRule('unknown.slot', 'agree')).toBe(false)
    expect(isAppliedRule('toString', 'agree')).toBe(false)
    expect(isAppliedRule('constructor', 'agree')).toBe(false)
  })
})
