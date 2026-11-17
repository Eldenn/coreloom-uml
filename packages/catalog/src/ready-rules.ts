import { inlineMarkdown } from './render/markdown.ts'
import {
  type AcceptedRule,
  LINE_VALUE_MAX_LENGTH,
  type ReadyRule,
  RULE_VALUE_MAX_LENGTH,
  type RuleGroup,
  RulePick,
} from './schemas.ts'
import type { Slot } from './slots.ts'

/**
 * The rules that do more than write a line: the renderer also derives a settings file, a Git
 * hook, the CI workflow or the container from them (`render/render-agent-context.ts` reads no
 * other slot). `'all'` when every rule of the group counts.
 */
export const APPLIED_RULES = {
  'tooling.checks': 'all',
  'tooling.package-manager': 'all',
  'workflow.autonomy': 'all',
  'git.commit-messages': ['conventional'],
  'git.attribution': ['agree'],
  'git.never-commit': ['secrets'],
  'git.ci-workflow': ['github-actions'],
  'security.secrets': ['agree'],
  'security.sandbox': ['container'],
  'security.network': 'all',
} as const satisfies Partial<Record<Slot, 'all' | readonly string[]>>

export type AppliedSlot = keyof typeof APPLIED_RULES

/** Whether accepting this rule changes a generated file besides AGENTS.md. */
export function isAppliedRule(slot: string, rule: string): boolean {
  if (!Object.hasOwn(APPLIED_RULES, slot)) return false
  const applied: 'all' | readonly string[] = APPLIED_RULES[slot as AppliedSlot]
  return applied === 'all' || applied.includes(rule)
}

/**
 * Why these rules cannot be held together in their group, or `null` when they can: each is a
 * rule of the group, named once; a `one` group holds one; a rule that stands `alone` has no
 * neighbour; an `input` rule comes with a non-blank text of at most 500 characters, and only it.
 */
export function acceptedProblem(
  group: RuleGroup,
  accepted: readonly Pick<AcceptedRule, 'rule' | 'value'>[],
): string | null {
  const seen = new Set<string>()
  for (const { rule: id, value } of accepted) {
    const rule = group.rules.find((item) => item.id === id)
    if (!rule) return `Unknown rule: ${id}`
    if (seen.has(id)) return `${id} is listed twice`
    seen.add(id)
    if (rule.input) {
      if (typeof value !== 'string' || value.trim() === '') return `${id} needs a text`
      if (value.length > RULE_VALUE_MAX_LENGTH) {
        return `Expected at most ${RULE_VALUE_MAX_LENGTH} characters`
      }
    } else if (value !== undefined && value !== null) {
      return `${id} takes no text`
    }
    if (rule.alone && accepted.length > 1) return `${id} cannot be combined`
  }
  if (group.pick === RulePick.One && accepted.length > 1) return 'This group holds one rule'
  return null
}

function fill(lines: readonly string[], rule: ReadyRule, value: string | null | undefined) {
  const filled = rule.input ? inlineMarkdown(value ?? '', LINE_VALUE_MAX_LENGTH) : rule.id
  return lines.map((line) => line.replaceAll('{value}', filled))
}

/**
 * The lines a group writes for the rules a configuration holds: each rule's own, in the group's
 * order, then the group's. `{value}` is the typed text folded to one line, cut to 200
 * characters and escaped for Markdown, or the rule's id. Rules that cannot be held together
 * write nothing.
 */
export function acceptedLines(
  group: RuleGroup,
  accepted: readonly Pick<AcceptedRule, 'rule' | 'value'>[],
): { rule: string; text: string }[] {
  if (accepted.length === 0 || acceptedProblem(group, accepted) !== null) return []
  const lines: { rule: string; text: string }[] = []
  let last: { rule: ReadyRule; value: string | null | undefined } | undefined
  for (const rule of group.rules) {
    const held = accepted.find((item) => item.rule === rule.id)
    if (!held) continue
    last = { rule, value: held.value }
    for (const text of fill(rule.lines, rule, held.value)) lines.push({ rule: rule.id, text })
  }
  if (group.lines && last) {
    for (const text of fill(group.lines, last.rule, last.value)) {
      lines.push({ rule: last.rule.id, text })
    }
  }
  return lines
}

/** A rule's name on a screen: its label, or its first line (the group's when it has none). */
export function ruleTitle(group: RuleGroup, rule: ReadyRule): { en: string; fr: string } {
  if (rule.label) return rule.label
  const line = rule.lines[0] ?? group.lines?.[0] ?? rule.id
  return { en: line, fr: line }
}
