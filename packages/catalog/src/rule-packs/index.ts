import type { RuleGroup, RulePack } from '../schemas.ts'
import { aiAgents } from './ai-agents.ts'
import { aiEngineering } from './ai-engineering.ts'
import { backendNode } from './backend-node.ts'
import { frontendPerformance } from './frontend-performance.ts'
import { frontendReact } from './frontend-react.ts'
import { gitWorkflow } from './git-workflow.ts'
import { security } from './security.ts'
import { softwareDesign } from './software-design.ts'
import { systemDesign } from './system-design.ts'

/** Every rule pack of the catalog, in the order their sections are rendered in. */
export const RULE_PACKS: readonly RulePack[] = [
  frontendReact,
  backendNode,
  gitWorkflow,
  security,
  systemDesign,
  softwareDesign,
  aiEngineering,
  aiAgents,
  frontendPerformance,
]

/** The group that feeds a slot: a slot is fed by one group of one pack. */
export function findRuleGroup(packs: readonly RulePack[], slot: string): RuleGroup | undefined {
  for (const pack of packs) {
    const group = pack.groups.find((item) => item.slot === slot)
    if (group) return group
  }
  return undefined
}
