// The flags the code checks. A flag is declared here once; the admin only edits its state.
// A key is never reused: a removed flag's stored state stays in the database, and a new flag with
// the same key would start from it.
import type { FeatureFlagState } from './evaluate.ts'

export const FeatureFlagKey = {
  LlmSubscriptionChatgpt: 'llm-subscription-chatgpt',
  LlmSubscriptionClaude: 'llm-subscription-claude',
  DiagramAssistant: 'diagram-assistant',
  McpServer: 'mcp-server',
  AgentRoles: 'agent-roles',
  CodeMaps: 'code-maps',
  WebResearch: 'web-research',
  AssistantActions: 'assistant-actions',
  AssistantRepository: 'assistant-repository',
  DesignRecords: 'design-records',
  TechWatch: 'tech-watch',
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
  {
    key: FeatureFlagKey.AgentRoles,
    name: 'Agent roles',
    description:
      'Roles in agent conventions: framed agents rendered per tool. Keep off until the CLI writes role files whole (it appends them again on a second pull).',
    tags: ['agents'],
    defaultState: OFF,
  },
  {
    key: FeatureFlagKey.CodeMaps,
    name: 'Code maps',
    description:
      'Lets people store maps of their code in a project and match its diagrams against them.',
    tags: ['code'],
    defaultState: OFF,
  },
  {
    key: FeatureFlagKey.WebResearch,
    name: 'Web research',
    description:
      'Lets people make agent conventions from web pages their own model reads in a sandbox. Needs E2B_API_KEY on the server.',
    tags: ['agents'],
    defaultState: OFF,
  },
  {
    key: FeatureFlagKey.AssistantActions,
    name: 'Assistant actions',
    description:
      'Lets the workspace assistant read projects, architectures and agent conventions, and propose changes the owner accepts one by one.',
    tags: ['llm'],
    defaultState: OFF,
  },
  {
    key: FeatureFlagKey.AssistantRepository,
    name: 'Assistant repository sandbox',
    description:
      "Lets the workspace assistant read a project's GitHub repository, cloned in a sandbox kept (paused) with the conversation, and run commands of its own there once the sandbox is cut off the network. Needs code maps and E2B_API_KEY on the server.",
    tags: ['code', 'llm'],
    defaultState: OFF,
  },
  {
    key: FeatureFlagKey.DesignRecords,
    name: 'Requirements and decisions',
    description:
      "Lets people record a project's requirements and architecture decisions, which the assistant reads before it draws.",
    tags: ['design', 'llm'],
    defaultState: OFF,
  },
  {
    key: FeatureFlagKey.TechWatch,
    name: 'Tech watch',
    description:
      'Shows the Watch page: articles from the RSS feeds the admin picks, tagged by topic, which the assistant reads too.',
    tags: ['watch'],
    defaultState: OFF,
  },
]

const KEYS: ReadonlySet<string> = new Set(Object.values(FeatureFlagKey))

export function isFeatureFlagKey(key: string): key is FeatureFlagKey {
  return KEYS.has(key)
}
