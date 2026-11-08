import type { RuleProposal } from '@coreloom-uml/llm'
import type { LlmFailureReason } from '#app/llm/constants/llm'

/** `POST /llm/test`: always 200, the outcome is in the body. */
export type LlmTestOutput =
  | { ok: true; latencyMs: number }
  | { ok: false; reason: LlmFailureReason }

/** A failed provider call (502): the reason only, never the provider's own error. */
export type LlmFailureOutput = { error: { message: string }; reason: LlmFailureReason }

/** `POST /projects/:id/agent-config/proposals`: nothing is stored. */
export type AgentProposalsOutput = {
  proposals: RuleProposal[]
  /** Some notes were cut to fit the input budget. */
  truncated: boolean
}
