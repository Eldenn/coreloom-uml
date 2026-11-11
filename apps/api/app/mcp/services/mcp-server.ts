import { AGENTS_FILE } from '@coreloom-uml/catalog'
import { formatDiagramText, validateDiagram } from '@coreloom-uml/uml'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import AgentConfig from '#app/agent-configs/models/agent-config'
import {
  findOwnedAgentConfig,
  latestGeneration,
} from '#app/agent-configs/services/owned-agent-config'
import Architecture from '#app/architectures/models/architecture'
import Diagram from '#app/diagrams/models/diagram'
import { MCP_LIST_MAX, MCP_SERVER_NAME, MCP_SERVER_VERSION, McpTool } from '#app/mcp/constants/mcp'
import {
  getAgentConventionsInput,
  getDiagramInput,
  listDiagramsInput,
} from '#app/mcp/validators/mcp-input'
import Project from '#app/projects/models/project'
import { findOwnedProject } from '#app/projects/services/owned-project'
import { assertOwner } from '#app/shared/authorization/assert-owner'
import type User from '#app/users/models/user'

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] })
const json = (value: unknown) => text(JSON.stringify(value, null, 2))
/** A tool error the agent reads. Something that isn't the caller's reads as not found. */
const failure = (message: string) => ({ ...text(message), isError: true })

/**
 * The MCP server of one request, with the tools bound to the account the API token belongs to.
 * Every tool reads, and only what `user` owns.
 */
export function buildMcpServer(user: User): McpServer {
  const server = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION })

  server.registerTool(
    McpTool.ListProjects,
    {
      description: 'Lists your Coreloom UML projects, most recently changed first.',
      annotations: READ_ONLY,
    },
    async () => {
      const projects = await Project.query()
        .where('userId', user.id)
        .orderBy('updatedAt', 'desc')
        .orderBy('id', 'desc')
        .limit(MCP_LIST_MAX)
      return json(
        projects.map((project) => ({
          id: project.id,
          name: project.name,
          description: project.description,
        })),
      )
    },
  )

  server.registerTool(
    McpTool.ListDiagrams,
    {
      description:
        'Lists the UML diagrams of a project, grouped by architecture. Read one with get_diagram.',
      inputSchema: listDiagramsInput,
      annotations: READ_ONLY,
    },
    async ({ projectId }) => {
      const query = Architecture.query().where('userId', user.id)
      if (projectId === undefined) {
        query.whereNull('projectId')
      } else {
        const project = await findOwnedProject(projectId, user)
        if (!project) return failure('Project not found')
        query.where('projectId', project.id)
      }
      const architectures = await query
        .preload('diagrams', (diagrams) => diagrams.orderBy('position').orderBy('id'))
        .orderBy('updatedAt', 'desc')
        .orderBy('id', 'desc')
        .limit(MCP_LIST_MAX)
      return json(
        architectures.map((architecture) => ({
          id: architecture.id,
          title: architecture.title,
          description: architecture.description,
          diagrams: architecture.diagrams.map((diagram) => ({
            id: diagram.id,
            title: diagram.title,
            kind: diagram.kind,
            format: diagram.format,
            version: diagram.version,
            updatedAt: diagram.updatedAt.toISO(),
          })),
        })),
      )
    },
  )

  server.registerTool(
    McpTool.GetDiagram,
    {
      description: 'Returns one UML diagram as Mermaid, PlantUML or JSON text.',
      inputSchema: getDiagramInput,
      annotations: READ_ONLY,
    },
    async ({ diagramId, format }) => {
      const diagram = await Diagram.query().where('id', diagramId).preload('architecture').first()
      if (!diagram || !assertOwner(diagram.architecture, user)) return failure('Diagram not found')
      if (!diagram.content) return text('')
      // Content saved before the API checked it may not match the schema: say so, don't guess.
      const { diagram: spec } = validateDiagram(diagram.content)
      if (!spec) return failure('This diagram is not valid.')
      return text(formatDiagramText(spec, format ?? diagram.format))
    },
  )

  server.registerTool(
    McpTool.ListAgentConventions,
    {
      description:
        'Lists your agent conventions, in a project or outside any. Read one with get_agent_conventions.',
      annotations: READ_ONLY,
    },
    async () => {
      const configs = await AgentConfig.query()
        .where('userId', user.id)
        .orderBy('updatedAt', 'desc')
        .orderBy('id', 'desc')
        .limit(MCP_LIST_MAX)
      return json(
        configs.map((config) => ({
          id: config.id,
          name: config.name,
          projectId: config.projectId,
        })),
      )
    },
  )

  server.registerTool(
    McpTool.GetAgentConventions,
    {
      description: `Returns the latest ${AGENTS_FILE} generated from agent conventions, chosen by their id or by their project.`,
      inputSchema: getAgentConventionsInput,
      annotations: READ_ONLY,
    },
    async ({ configId, projectId }) => {
      if ((configId === undefined) === (projectId === undefined)) {
        return failure('Pass either configId or projectId.')
      }
      let config: AgentConfig | null
      if (configId !== undefined) {
        config = await findOwnedAgentConfig(configId, user)
      } else {
        const project = await findOwnedProject(projectId as number, user)
        if (!project) return failure('Project not found')
        config = await AgentConfig.findBy('projectId', project.id)
        if (config && !assertOwner(config, user)) config = null
      }
      if (!config) return failure('Agent configuration not found')
      const generation = await latestGeneration(config)
      const file = generation?.files.find((item) => item.path === AGENTS_FILE)
      if (!file) return failure('Nothing was generated yet for these conventions.')
      return text(file.content)
    },
  )

  return server
}
