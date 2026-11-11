// The flags the code checks. A flag is declared here once; the admin only edits its state.
// A key is never reused: a removed flag's stored state stays in the database, and a new flag with
// the same key would start from it.
import type { FeatureFlagState } from './evaluate.ts'

export const FeatureFlagKey = {
  LlmSubscriptionChatgpt: 'llm-subscription-chatgpt',
  LlmSubscriptionClaude: 'llm-subscription-claude',
  DiagramAssistant: 'diagram-assistant',
  McpServer: 'mcp-server',
} as const

export type FeatureFlagKey = (typeof FeatureFlagKey)[keyof typeof FeatureFlagKey]

export type FeatureFlagDeclaration = {
  key: FeatureFlagKey
  name: string
  description: string
  tags: string[]
  defaultState: FeatureFlagState
}

/** The instance is the only environment. */
export const FEATURE_FLAG_ENVIRONMENT = 'instance'

const OFF: FeatureFlagState = { enabled: false, rollout: 0, rules: [] }

export const FEATURE_FLAGS: readonly FeatureFlagDeclaration[] = [
  {
    key: FeatureFlagKey.LlmSubscriptionChatgpt,
    name: 'ChatGPT subscription sign-in',
    description: 'Lets people call the LLM with their ChatGPT subscription instead of an API key.',
    tags: ['llm'],
    defaultState: OFF,
  },
  {
    key: FeatureFlagKey.LlmSubscriptionClaude,
    name: 'Claude subscription sign-in',
    description: 'Lets people call the LLM with their Claude subscription through Claude Code.',
    tags: ['llm'],
    defaultState: OFF,
  },
  {
    key: FeatureFlagKey.DiagramAssistant,
    name: 'Workspace AI assistant',
    description: 'Lets people ask a model about an architecture and accept the views it proposes.',
    tags: ['llm'],
    defaultState: OFF,
  },
  {
    key: FeatureFlagKey.McpServer,
    name: 'MCP server',
    description:
      'Lets coding agents read projects, diagrams and agent conventions through MCP with an API key.',
    tags: ['agents'],
    defaultState: OFF,
  },
]

const KEYS: ReadonlySet<string> = new Set(Object.values(FeatureFlagKey))

export function isFeatureFlagKey(key: string): key is FeatureFlagKey {
  return KEYS.has(key)
}
