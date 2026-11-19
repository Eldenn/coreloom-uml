export { AGENT_FILE_KINDS, AgentFileKind, TARGETS, Target } from '@coreloom-uml/catalog'

/** Where one of the owner's rules comes from: written by hand, or a proposal they accepted. */
export const AgentRuleSource = {
  Manual: 'manual',
  Llm: 'llm',
} as const
export type AgentRuleSource = (typeof AgentRuleSource)[keyof typeof AgentRuleSource]
export const AGENT_RULE_SOURCES = Object.values(AgentRuleSource)

/** Longest configuration name (the `agent_configs.name` column). */
export const AGENT_CONFIG_NAME_MAX_LENGTH = 120

/** Longest rule, preset, slot or section name accepted on the wire. */
export const AGENT_CATALOG_ID_MAX_LENGTH = 64

/** Accepted rules one configuration can hold. */
export const AGENT_RULES_MAX = 50
/** Roles one configuration can hold. */
export const AGENT_ROLES_MAX = 20
/** Longest accepted rule (the `agent_config_rules.text` column). */
export const AGENT_RULE_TEXT_MAX_LENGTH = 300
/** Longest project notes. */
export const AGENT_NOTES_MAX_LENGTH = 10_000
/** Ready-made rules one `PUT …/ready-rules/:slot` can carry: more than any group holds. */
export const AGENT_READY_RULES_PER_GROUP_MAX = 50
/** Generations kept per configuration: past this, the oldest is deleted. */
export const AGENT_GENERATIONS_KEPT = 50

/** What a proposal call reads: the project's diagrams, or review feedback the owner pastes. */
export const AgentProposalSource = {
  Diagrams: 'diagrams',
  Feedback: 'feedback',
} as const
export type AgentProposalSource = (typeof AgentProposalSource)[keyof typeof AgentProposalSource]
export const AGENT_PROPOSAL_SOURCES = Object.values(AgentProposalSource)
/** Diagrams one proposal call can read. */
export const AGENT_PROPOSAL_DIAGRAMS_MAX = 20
/** Longest review feedback one proposal call reads. */
export const AGENT_PROPOSAL_FEEDBACK_MAX_LENGTH = 20_000
/** Longest conventions file an import reads. */
export const AGENT_IMPORT_MAX_LENGTH = 50_000
