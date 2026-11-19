import { isDeepStrictEqual } from 'node:util'
import { acceptedProblem, type Role, RULE_PACKS } from '@coreloom-uml/catalog'
import {
  AGENT_NOTES_MAX_LENGTH,
  AGENT_ROLES_MAX,
  AGENT_RULES_MAX,
  type AgentRuleSource,
  TARGETS,
  type Target,
} from '#app/agent-configs/constants/agent-config'
import type {
  AgentMergeConflictsOutput,
  AgentReadyRuleOutput,
} from '#app/agent-configs/validators/agent-configs-output'

/*
 * Merging configurations into the content of a new one: a pure function, the sources are only
 * read. Everything adds up with duplicates dropped, except what cannot be held together: the
 * ready-made rules of a group (`acceptedProblem`) and two different roles with one slug. Those
 * are conflicts, each settled by naming the source whose version is kept.
 */

export type MergeSource = {
  id: number
  targets: Target[]
  notes: string | null
  readyRules: AgentReadyRuleOutput[]
  rules: { section: string; text: string; source: AgentRuleSource }[]
  roles: Role[]
}

export type MergeChoices = {
  readyRules?: { slot: string; sourceId: number }[]
  roles?: { slug: string; sourceId: number }[]
}

export type Merged = Omit<MergeSource, 'id'>

export type MergeOutcome =
  | { merged: Merged }
  /** Conflicts no choice settles yet: nothing can be created. */
  | { conflicts: AgentMergeConflictsOutput }
  | { refused: { error: { message: string } } }

function refused(message: string) {
  return { refused: { error: { message } } }
}

/** Keeps the first of the items that are equal. */
function distinct<T>(items: T[], same: (a: T, b: T) => boolean = isDeepStrictEqual): T[] {
  return items.filter((item, index) => items.findIndex((other) => same(other, item)) === index)
}

/**
 * The sources' content merged, in the sources' order. A choice that names a source holding
 * nothing of its conflict settles nothing: the conflict is answered again.
 */
export function mergeSources(sources: MergeSource[], choices: MergeChoices = {}): MergeOutcome {
  const conflicts: AgentMergeConflictsOutput = { readyRules: [], roles: [] }

  const readyRules: AgentReadyRuleOutput[] = []
  for (const group of RULE_PACKS.flatMap((pack) => pack.groups)) {
    // What each source holds in this group that the catalog still has, in catalog order.
    const held = sources
      .map((source) => ({
        sourceId: source.id,
        rules: group.rules.flatMap((rule) =>
          source.readyRules
            .filter((row) => row.slot === group.slot && row.rule === rule.id)
            .map((row) => ({ rule: row.rule, value: row.value })),
        ),
      }))
      .filter((option) => option.rules.length > 0)
    const all = distinct(held.flatMap((option) => option.rules))
    let kept = all
    if (acceptedProblem(group, all) !== null) {
      const options = distinct(held, (a, b) => isDeepStrictEqual(a.rules, b.rules))
      const sourceId = choices.readyRules?.find((choice) => choice.slot === group.slot)?.sourceId
      const chosen = options.find((option) => option.sourceId === sourceId)
      if (!chosen) {
        conflicts.readyRules.push({ slot: group.slot, options })
        continue
      }
      kept = chosen.rules
    }
    readyRules.push(...kept.map((rule) => ({ slot: group.slot, ...rule })))
  }

  const roles: Role[] = []
  const everyRole = sources.flatMap((source) =>
    source.roles.map((role) => ({ sourceId: source.id, role })),
  )
  for (const slug of new Set(everyRole.map((item) => item.role.slug))) {
    const options = distinct(
      everyRole.filter((item) => item.role.slug === slug),
      (a, b) => isDeepStrictEqual(a.role, b.role),
    )
    const sourceId = choices.roles?.find((choice) => choice.slug === slug)?.sourceId
    const chosen =
      options.length === 1 ? options[0] : options.find((option) => option.sourceId === sourceId)
    if (chosen) roles.push(chosen.role)
    else {
      conflicts.roles.push({
        slug,
        options: options.map(({ sourceId: id, role }) => ({
          sourceId: id,
          name: role.name,
          description: role.description,
        })),
      })
    }
  }

  const rules = distinct(
    sources.flatMap((source) => source.rules),
    (a, b) => a.section === b.section && a.text === b.text,
  )
  const notes = [
    ...new Set(sources.map((source) => source.notes?.trim() ?? '').filter(Boolean)),
  ].join('\n\n')

  // Limits first: no point in settling conflicts for a merge that cannot be created.
  if (rules.length > AGENT_RULES_MAX) {
    return refused(
      `Together they hold ${rules.length} rules; a configuration holds at most ${AGENT_RULES_MAX}.`,
    )
  }
  if (roles.length + conflicts.roles.length > AGENT_ROLES_MAX) {
    return refused(`Together they hold more than ${AGENT_ROLES_MAX} roles.`)
  }
  if (notes.length > AGENT_NOTES_MAX_LENGTH) {
    return refused(`Together their notes exceed ${AGENT_NOTES_MAX_LENGTH} characters.`)
  }
  if (conflicts.readyRules.length > 0 || conflicts.roles.length > 0) return { conflicts }

  return {
    merged: {
      targets: TARGETS.filter((target) =>
        sources.some((source) => source.targets.includes(target)),
      ),
      notes: notes || null,
      readyRules,
      rules,
      roles,
    },
  }
}
