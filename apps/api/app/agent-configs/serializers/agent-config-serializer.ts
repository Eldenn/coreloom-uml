import {
  isAppliedRule,
  RULE_PACKS,
  type RulePack,
  ruleSections,
  ruleTitle,
} from '@coreloom-uml/catalog'
import type AgentConfig from '#app/agent-configs/models/agent-config'
import type AgentConfigGeneration from '#app/agent-configs/models/agent-config-generation'
import type AgentConfigRole from '#app/agent-configs/models/agent-config-role'
import type AgentConfigRule from '#app/agent-configs/models/agent-config-rule'
import type AgentConfigSkill from '#app/agent-configs/models/agent-config-skill'
import type {
  AgentConfigDetailOutput,
  AgentConfigOutput,
  AgentGenerationOutput,
  AgentGenerationSummaryOutput,
  AgentReadyRuleOutput,
  AgentRoleOutput,
  AgentRuleOutput,
  RulePackOutput,
} from '#app/agent-configs/validators/agent-configs-output'

export function serializeRulePack(pack: RulePack): RulePackOutput {
  return {
    id: pack.id,
    title: pack.title,
    description: pack.description,
    sections: [...pack.sections],
    groups: pack.groups.map((group) => ({
      slot: group.slot,
      section: group.section,
      label: group.label,
      help: group.help ?? null,
      pick: group.pick,
      lines: [...(group.lines ?? [])],
      rules: group.rules.map((rule) => ({
        id: rule.id,
        title: ruleTitle(group, rule),
        lines: [...rule.lines],
        input: rule.input === true,
        alone: rule.alone === true,
        applied: isAppliedRule(group.slot, rule.id),
      })),
    })),
  }
}

export function serializeAgentConfig(config: AgentConfig): AgentConfigOutput {
  return {
    id: config.id,
    projectId: config.projectId,
    name: config.name,
    targets: config.targets,
    notes: config.notes,
    revision: config.revision,
    createdAt: config.createdAt.toISO() ?? '',
    updatedAt: config.updatedAt.toISO() ?? '',
  }
}

export function serializeAgentRule(rule: AgentConfigRule): AgentRuleOutput {
  return {
    id: rule.id,
    section: rule.section,
    text: rule.text,
    source: rule.source,
    position: rule.position,
    createdAt: rule.createdAt.toISO() ?? '',
    updatedAt: rule.updatedAt.toISO() ?? '',
  }
}

export function serializeAgentRole(role: AgentConfigRole): AgentRoleOutput {
  return {
    id: role.id,
    ...role.toRole(),
    createdAt: role.createdAt.toISO() ?? '',
    updatedAt: role.updatedAt.toISO() ?? '',
  }
}

export function serializeAgentGenerationSummary(
  generation: AgentConfigGeneration,
): AgentGenerationSummaryOutput {
  return {
    id: generation.id,
    revision: generation.revision,
    catalogVersion: generation.catalogVersion,
    paths: generation.files.map((file) => file.path),
    createdAt: generation.createdAt.toISO() ?? '',
  }
}

export function serializeAgentGeneration(generation: AgentConfigGeneration): AgentGenerationOutput {
  return {
    ...serializeAgentGenerationSummary(generation),
    files: generation.files,
    recommendations: generation.recommendations,
    skills: { ...generation.skills, held: generation.skills.held ?? [] },
    targets: generation.inputs.targets,
    roles: generation.roles,
  }
}

/**
 * The ready-made rules a configuration holds that the catalog still has, in catalog order (packs,
 * groups, then each group's rules).
 */
export function heldReadyRules(rows: readonly AgentReadyRuleOutput[]): AgentReadyRuleOutput[] {
  return RULE_PACKS.flatMap((pack) =>
    pack.groups.flatMap((group) =>
      group.rules.flatMap((rule) =>
        rows
          .filter((row) => row.slot === group.slot && row.rule === rule.id)
          .map(({ slot, rule: id, value }) => ({ slot, rule: id, value })),
      ),
    ),
  )
}

/** Held skills in name order, then slug order (`skill` preloaded). */
export function byName(rows: AgentConfigSkill[]): AgentConfigSkill[] {
  return [...rows].sort(
    (a, b) => a.skill.name.localeCompare(b.skill.name) || a.skill.slug.localeCompare(b.skill.slug),
  )
}

/**
 * Expects `readyRules`, `rules` and `roles` preloaded (`currentInputs` loads them), rules in
 * position order, roles in id order, and `skills` with their `skill`.
 */
export function serializeAgentConfigDetail(
  config: AgentConfig,
  latest: AgentConfigGeneration | null,
  diagrams: AgentConfigDetailOutput['diagrams'],
): AgentConfigDetailOutput {
  return {
    ...serializeAgentConfig(config),
    ruleSections: ruleSections(RULE_PACKS),
    readyRules: heldReadyRules(config.readyRules),
    rules: config.rules.map(serializeAgentRule),
    roles: config.roles.map(serializeAgentRole),
    skills: byName(config.skills).map(({ skill }) => ({
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      url: skill.url,
    })),
    latestGeneration: latest ? serializeAgentGenerationSummary(latest) : null,
    diagrams,
  }
}
