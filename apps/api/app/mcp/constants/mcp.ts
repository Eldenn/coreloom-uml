/** How the server names itself to an MCP client. */
export const MCP_SERVER_NAME = 'coreloom-uml'
export const MCP_SERVER_VERSION = '1.0.0'

/** The tools a coding agent can call. All of them only read. */
export const McpTool = {
  ListProjects: 'list_projects',
  ListDiagrams: 'list_diagrams',
  GetDiagram: 'get_diagram',
  ListAgentConventions: 'list_agent_conventions',
  GetAgentConventions: 'get_agent_conventions',
} as const
export type McpTool = (typeof McpTool)[keyof typeof McpTool]

/** Projects, architectures or agent conventions listed by one call, newest first. */
export const MCP_LIST_MAX = 200
