import type { ProviderAuth } from '@coreloom-uml/catalog'
import type { RuleProposal } from '@coreloom-uml/llm'
import type { LlmFailureReason, ProviderKind } from '#app/llm/constants/llm'

/** `GET /llm/providers`: the provider kinds this server can call, for the settings screen. */
export type LlmProvidersOutput = {
  providers: {
    kind: ProviderKind
    /** A key sent with each call, or a subscription the user connects once. */
    auth: ProviderAuth
    /** Ready to call: always for a key kind; for a subscription, once connected. */
    connected: boolean
    /** A hosted provider needs the user's key; a local or private server may take none. */
    requiresApiKey: boolean
    /** Calls a server the user names, whose origin must be in `allowedBaseUrls`. */
    takesBaseUrl: boolean
    /** Model names to suggest; any other name is accepted. */
    models: string[]
  }[]
  /** Origins (`LLM_ALLOWED_BASE_URLS`) a base URL may point to; empty when none is allowed. */
  allowedBaseUrls: string[]
}

/** `POST /llm/test`: always 200, the outcome is in the body. */
export type LlmTestOutput =
  | { ok: true; latencyMs: number }
  | { ok: false; reason: LlmFailureReason }

/** A failed provider call (502): the reason only, never the provider's own error. */
export type LlmFailureOutput = { error: { message: string }; reason: LlmFailureReason }

/** `POST /projects/:id/agent-config/proposals`: nothing is stored. */
export type AgentProposalsOutput = {
  proposals: RuleProposal[]
  /** Some notes or feedback were cut, or some diagrams left out, to fit the input budget. */
  truncated: boolean
  /** Diagrams left out whole to fit the budget (`from: 'diagrams'` only). */
  skipped: number[]
}
