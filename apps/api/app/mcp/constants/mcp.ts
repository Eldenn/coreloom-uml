/** How the server names itself to an MCP client. */
export const MCP_SERVER_NAME = 'coreloom-uml'
export const MCP_SERVER_VERSION = '1.0.0'

/** The tools a coding agent can call. All of them read but those of `WRITE_TOOLS`. */
export const McpTool = {
  ListProjects: 'list_projects',
  ListDiagrams: 'list_diagrams',
  GetDiagram: 'get_diagram',
  ListAgentConventions: 'list_agent_conventions',
  GetAgentConventions: 'get_agent_conventions',
  /** Behind the `code-maps` flag too. */
  GetCodeConformance: 'get_code_conformance',
  /** Behind the `code-maps` flag too. */
  ListUndocumentedProcesses: 'list_undocumented_processes',
  /** Behind the `design-records` flag too. */
  ListRequirements: 'list_requirements',
  /** Behind the `design-records` flag too. */
  ListDecisions: 'list_decisions',
  /** Behind the `design-records` flag and the token's `write` ability: stores a proposal. */
  ProposeDecision: 'propose_decision',
} as const
export type McpTool = (typeof McpTool)[keyof typeof McpTool]

/** The tools only listed to an account with code maps turned on. */
export const CODE_MAP_TOOLS: readonly McpTool[] = [
  McpTool.GetCodeConformance,
  McpTool.ListUndocumentedProcesses,
]

/** The tools only listed to an account with requirements and decisions turned on. */
export const DESIGN_TOOLS: readonly McpTool[] = [McpTool.ListRequirements, McpTool.ListDecisions]

/**
 * The tools that write, only listed to a token with the `write` ability (and, being design tools,
 * with requirements and decisions turned on). Each stores a proposal for the owner to review,
 * never applies it.
 */
export const WRITE_TOOLS: readonly McpTool[] = [McpTool.ProposeDecision]

/** Projects, architectures or agent conventions listed by one call, newest first. */
export const MCP_LIST_MAX = 200
