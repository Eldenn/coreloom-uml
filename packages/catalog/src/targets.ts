/**
 * The coding tools a configuration renders files for. A target is a rendering choice, not a
 * property of the answers: every target gets the same AGENTS.md, and a tool that does not read
 * AGENTS.md natively also gets a short pointer file (see `targets/`).
 *
 * The order of this list is the order files and recommendations are rendered in.
 */
export const Target = {
  Generic: 'generic',
  Codex: 'codex',
  Cursor: 'cursor',
  GithubCopilot: 'github-copilot',
  ClaudeCode: 'claude-code',
  GeminiCli: 'gemini-cli',
} as const

export type Target = (typeof Target)[keyof typeof Target]

export const TARGETS = Object.values(Target) as readonly Target[]

/**
 * What a rendered file is: the shared conventions, a pointer to them, or a tool's own settings
 * file (JSON or TOML) holding what the tool enforces.
 */
export const AgentFileKind = {
  Generic: 'generic',
  Pointer: 'pointer',
  Settings: 'settings',
} as const

export type AgentFileKind = (typeof AgentFileKind)[keyof typeof AgentFileKind]

export const AGENT_FILE_KINDS = Object.values(AgentFileKind) as readonly AgentFileKind[]

/** The file every target reads, natively or through a pointer. */
export const AGENTS_FILE = 'AGENTS.md'
