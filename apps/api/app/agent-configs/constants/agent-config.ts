export { AGENT_FILE_KINDS, AgentFileKind, TARGETS, Target } from '@coreloom-uml/catalog'

/** Where an accepted rule comes from: written by hand, or a model's proposal the owner accepted. */
export const AgentRuleSource = {
  Manual: 'manual',
  Llm: 'llm',
} as const
export type AgentRuleSource = (typeof AgentRuleSource)[keyof typeof AgentRuleSource]
export const AGENT_RULE_SOURCES = Object.values(AgentRuleSource)

/** Longest configuration name (the `agent_configs.name` column). */
export const AGENT_CONFIG_NAME_MAX_LENGTH = 120

/** Accepted rules one configuration can hold. */
export const AGENT_RULES_MAX = 50
/** Longest accepted rule (the `agent_config_rules.text` column). */
export const AGENT_RULE_TEXT_MAX_LENGTH = 300
/** Longest project notes. */
export const AGENT_NOTES_MAX_LENGTH = 10_000
/** Longest "more details" text on one answer. */
export const AGENT_ANSWER_DETAILS_MAX_LENGTH = 2000
/** Answers one `PUT …/answers` can carry. */
export const AGENT_ANSWERS_PER_REQUEST_MAX = 200
/** Generations kept per configuration: past this, the oldest is deleted. */
export const AGENT_GENERATIONS_KEPT = 50

/**
 * What a proposal call reads: the notes under the answers, the project's diagrams, or review
 * feedback the owner pastes.
 */
export const AgentProposalSource = {
  Answers: 'answers',
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
