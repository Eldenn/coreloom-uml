import { describe, expect, it } from 'vitest'

import type { RuleGroup, RulePack } from '@/lib/agent-configs'
import {
  chooseRule,
  extraLines,
  fillValue,
  groupSearchText,
  matchesTerms,
  searchTerms,
  waitingRule,
} from '@/lib/ready-rules'

const text = (en: string) => ({ en, fr: en })
const rule = (id: string, extra: Partial<RuleGroup['rules'][number]> = {}) => ({
  id,
  title: text(id),
  lines: [id],
  input: false,
  alone: false,
  applied: false,
  ...extra,
})
const group = (pick: RuleGroup['pick'], rules: RuleGroup['rules']): RuleGroup => ({
  slot: 'a.b',
  section: 'Git',
  label: text('Séparé with `feat:`'),
  help: null,
  pick,
  lines: [],
  rules,
})

describe('chooseRule', () => {
  it('keeps one rule in a group that holds one, and can hold none', () => {
    const one = group('one', [rule('a'), rule('b')])
    expect(chooseRule(one, [{ rule: 'a', value: null }], { rule: 'b', chosen: true })).toEqual([
      { rule: 'b', value: null },
    ])
    expect(chooseRule(one, [{ rule: 'b', value: null }], { rule: 'b', chosen: false })).toEqual([])
  })

  it('drops the others for a rule that stands alone, and drops it for another', () => {
    const many = group('many', [rule('a'), rule('b'), rule('none', { alone: true })])
    const both = chooseRule(many, [{ rule: 'b', value: null }], { rule: 'a', chosen: true })
    expect(both.map((choice) => choice.rule)).toEqual(['a', 'b'])
    const alone = chooseRule(many, both, { rule: 'none', chosen: true })
    expect(alone).toEqual([{ rule: 'none', value: null }])
    expect(chooseRule(many, alone, { rule: 'b', chosen: true })).toEqual([
      { rule: 'b', value: null },
    ])
  })
})

describe('typed text', () => {
  const run = rule('run', { input: true, lines: ['Run: {value}.'] })
  const checks = group('one', [run])

  it('waits for a text that is blank or too long', () => {
    expect(waitingRule(checks, [{ rule: 'run', value: '  ' }])).toBe(run)
    expect(waitingRule(checks, [{ rule: 'run', value: 'x'.repeat(501) }])).toBe(run)
    expect(waitingRule(checks, [{ rule: 'run', value: 'pnpm test' }])).toBeNull()
    expect(waitingRule(checks, [])).toBeNull()
  })

  it('writes the text, or the id of a rule without one', () => {
    expect(fillValue('Run: {value}.', run, ' pnpm test ')).toBe('Run: pnpm test.')
    expect(fillValue('Run: {value}.', run, null)).toBe('Run: ….')
    expect(fillValue('Use {value}.', rule('pnpm'), null)).toBe('Use pnpm.')
  })

  it('shows no line under a name that is the line', () => {
    expect(extraLines(rule('a'), 'en')).toEqual([])
    expect(extraLines(rule('a', { title: text('Short') }), 'en')).toEqual(['a'])
  })
})

describe('search', () => {
  const pack = { title: text('Git workflow') } as RulePack
  const haystack = groupSearchText(pack, group('one', [rule('a')]), 'en')

  it('ignores case, accents and code marks, and needs every word', () => {
    expect(matchesTerms(haystack, searchTerms('separe'))).toBe(true)
    expect(matchesTerms(haystack, searchTerms('SÉPARÉ `feat:`'))).toBe(true)
    expect(matchesTerms(haystack, searchTerms('git workflow feat'))).toBe(true)
    expect(matchesTerms(haystack, searchTerms('separe missing'))).toBe(false)
  })
})
