// Ready-made rules, as pure functions: which rules a group holds after a choice, whether they can
// be saved yet, the lines they write, and the search over the catalog.
import type { HeldRule, ReadyRule, RuleGroup, RulePack } from '@/lib/agent-configs'

/** Longest typed text of a rule that takes one, as the API checks it. */
export const RULE_VALUE_MAX_LENGTH = 500

/** The group whose typed text is a list of commands, joined with `&&`. */
export const CHECKS_SLOT = 'tooling.checks'

/** The id of a group's block in the catalog, to scroll to it. */
export const groupDomId = (slot: string) => `rule-group-${slot}`

/** A rule held in a group, with its typed text when it takes one. */
export interface Choice {
  rule: string
  value: string | null
}

export type Locale = keyof RulePack['title']

/**
 * The rules a group holds after one of them is chosen (with its typed text, for a rule that takes
 * one) or dropped, in the group's order.
 */
export function chooseRule(
  group: RuleGroup,
  held: readonly Choice[],
  change: { rule: string; chosen: boolean; value?: string },
): Choice[] {
  const rule = group.rules.find((item) => item.id === change.rule)
  if (!rule) return [...held]
  if (!change.chosen) return held.filter((choice) => choice.rule !== rule.id)
  const choice: Choice = { rule: rule.id, value: rule.input ? (change.value ?? '') : null }
  if (group.pick === 'one' || rule.alone) return [choice]
  // A rule that stands alone leaves as soon as another one is chosen.
  return group.rules.flatMap((item) => {
    if (item.id === rule.id) return [choice]
    return item.alone ? [] : held.filter((kept) => kept.rule === item.id)
  })
}

/** Whether two groups hold the same rules with the same texts. */
export function sameChoices(a: readonly Choice[], b: readonly Choice[]): boolean {
  const text = (choice: Choice | undefined) => choice?.value?.trim() ?? null
  return (
    a.length === b.length &&
    a.every(
      (choice, index) => choice.rule === b.at(index)?.rule && text(choice) === text(b.at(index)),
    )
  )
}

/** Why a typed text cannot be saved, or `null` when it can. */
export function valueProblem(value: string | null): 'blank' | 'long' | null {
  const text = (value ?? '').trim()
  if (text === '') return 'blank'
  return text.length > RULE_VALUE_MAX_LENGTH ? 'long' : null
}

/** The first chosen rule whose text is still missing or too long: the group waits for it. */
export function waitingRule(group: RuleGroup, held: readonly Choice[]): ReadyRule | null {
  return (
    group.rules.find((rule) => {
      const choice = held.find((item) => item.rule === rule.id)
      return rule.input && choice !== undefined && valueProblem(choice.value) !== null
    }) ?? null
  )
}

/** `{value}` as the files write it: the typed text (an ellipsis before one) or the rule's id. */
export function fillValue(text: string, rule: ReadyRule, value: string | null): string {
  if (!rule.input) return text.replaceAll('{value}', rule.id)
  const typed = value?.trim() ?? ''
  return text.replaceAll('{value}', typed === '' ? '…' : typed)
}

/**
 * The lines a group writes whatever the rule held, as the files write them: `{value}` is taken
 * from the last rule held, and stays open while none is.
 */
export function groupLines(group: RuleGroup, held: readonly Choice[]): string[] {
  const last = group.rules.findLast((rule) => held.some((choice) => choice.rule === rule.id))
  const value = held.find((choice) => choice.rule === last?.id)?.value ?? null
  return group.lines.map((line) =>
    last ? fillValue(line, last, value) : line.replaceAll('{value}', '…'),
  )
}

/** A catalog text without its code and strong marks, for an accessible name. */
export function plainText(text: string): string {
  return text.replaceAll('`', '').replaceAll('**', '')
}

/** The lines shown under a rule's name: none when the name is already its only line. */
export function extraLines(rule: ReadyRule, locale: Locale): string[] {
  return rule.lines.length === 1 && rule.lines[0] === rule.title[locale] ? [] : rule.lines
}

export function isApplied(group: RuleGroup): boolean {
  return group.rules.some((rule) => rule.applied)
}

/** The rules a configuration holds, group by group. */
export function heldBySlot(held: readonly HeldRule[]): Map<string, Choice[]> {
  const bySlot = new Map<string, Choice[]>()
  for (const { slot, rule, value } of held) {
    bySlot.set(slot, [...(bySlot.get(slot) ?? []), { rule, value }])
  }
  return bySlot
}

/** Lower case, without accents or code marks: how the search compares texts. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replaceAll('`', '').toLowerCase()
}

/** The words of a search; a group matches when it has them all. */
export function searchTerms(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean)
}

/** Everything the search reads in a group: its pack, section, label, help and rules. */
export function groupSearchText(pack: RulePack, group: RuleGroup, locale: Locale): string {
  return fold(
    [
      pack.title[locale],
      group.section,
      group.label[locale],
      group.help?.[locale] ?? '',
      ...group.lines,
      ...group.rules.flatMap((rule) => [rule.title[locale], ...rule.lines]),
    ].join('\n'),
  )
}

export function matchesTerms(text: string, terms: readonly string[]): boolean {
  return terms.every((term) => text.includes(term))
}
