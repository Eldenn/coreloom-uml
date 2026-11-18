// What a review of imported rules works on, as plain functions: shared by the import panel and by
// the assistant's messages that carry proposals.
import type { AgentConfig, RulePack } from '@/lib/agent-configs'
import type { ImportedReadyRule, ResearchSource } from '@/lib/llm-provider'
import { type Choice, chooseRule, heldBySlot } from '@/lib/ready-rules'

export type Groups = Map<string, RulePack['groups'][number]>

/** `slot/rule`, the key of a proposed ready-made rule. */
export const readyKey = (item: { slot: string; rule: string }) => `${item.slot}/${item.rule}`

/** What is left to review. */
export interface ImportResult {
  ready: ImportedReadyRule[]
  rules: { id: string; section: string; text: string; basedOn: null }[]
  truncated: boolean
  /** The pages a web research read; `null` for a file. */
  sources: ResearchSource[] | null
}

/** Every group of the catalog by its slot. */
export function groupsBySlot(packs: RulePack[]): Groups {
  return new Map(packs.flatMap((pack) => pack.groups).map((group) => [group.slot, group]))
}

/** The rules a group holds once a proposed one is added to them. */
export function withProposed(
  group: RulePack['groups'][number],
  held: readonly Choice[],
  item: ImportedReadyRule,
) {
  return chooseRule(group, held, { rule: item.rule, chosen: true, value: item.value ?? '' })
}

/**
 * The proposed ready-made rules checked at first: one that would push out a rule already held is
 * left for the owner to check.
 */
export function safeReadyKeys(
  config: AgentConfig,
  groups: Groups,
  ready: ImportedReadyRule[],
): Set<string> {
  const held = heldBySlot(config.readyRules)
  const safe = ready.filter((item) => {
    const group = groups.get(item.slot)
    const current = held.get(item.slot) ?? []
    return group && withProposed(group, current, item).length > current.length
  })
  return new Set(safe.map(readyKey))
}
