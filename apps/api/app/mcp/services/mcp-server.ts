import { AGENTS_FILE } from '@coreloom-uml/catalog'
import { formatDiagramText, validateDiagram } from '@coreloom-uml/uml'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import AgentConfig from '#app/agent-configs/models/agent-config'
import {
  findOwnedAgentConfig,
  latestGeneration,
} from '#app/agent-configs/services/owned-agent-config'
import Architecture from '#app/architectures/models/architecture'
import {
  AGENT_PROPOSALS_WAITING_MAX,
  DecisionOrigin,
  DecisionStatus,
} from '#app/decisions/constants/decision'
import Decision from '#app/decisions/models/decision'
import { serializeParts } from '#app/decisions/serializers/decision-serializer'
import { reviewed, waitingProposals } from '#app/decisions/services/agent-proposals'
import { createDecision, DECISIONS_FULL, withLinks } from '#app/decisions/services/decision-writes'
import Diagram from '#app/diagrams/models/diagram'
import { MCP_LIST_MAX, MCP_SERVER_NAME, MCP_SERVER_VERSION, McpTool } from '#app/mcp/constants/mcp'
import {
  getCodeConformance,
  listUndocumentedProcesses,
  NO_READY_MAP,
} from '#app/mcp/services/mcp-code-conformance'
import {
  getAgentConventionsInput,
  getCodeConformanceInput,
  getDiagramInput,
  listDecisionsInput,
  listDiagramsInput,
  listRequirementsInput,
  listUndocumentedProcessesInput,
  proposeDecisionInput,
} from '#app/mcp/validators/mcp-input'
import Project from '#app/projects/models/project'
import { findOwnedProject } from '#app/projects/services/owned-project'
import Requirement from '#app/requirements/models/requirement'
import { assertOwner } from '#app/shared/authorization/assert-owner'
import type User from '#app/users/models/user'

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const
/** A tool that adds a record for the owner to review: it changes nothing already stored. */
const PROPOSES = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const

const PROPOSALS_WAITING = `${AGENT_PROPOSALS_WAITING_MAX} proposals already wait for the owner's review in this project: the owner must review them before another one can be sent.`

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] })
const json = (value: unknown) => text(JSON.stringify(value, null, 2))
/** A tool error the agent reads. Something that isn't the caller's reads as not found. */
const failure = (message: string) => ({ ...text(message), isError: true })

/** What the account may read beyond diagrams and conventions. */
export type McpServerOptions = {
  /** The `code-maps` flag: lists the conformance tools. */
  codeMaps: boolean
  /** The `design-records` flag: lists the requirements and decisions tools. */
  designRecords: boolean
  /** The token's `write` ability: lists the tools that store a proposal for the owner. */
  write: boolean
}

/**
 * The MCP server of one request, with the tools bound to the account the API token belongs to.
 * Every tool reads only what `user` owns; the one that writes (`propose_decision`, with `write`)
 * stores a proposal the owner reviews, never applies it.
 */
export function buildMcpServer(user: User, options: McpServerOptions): McpServer {
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

  if (options.codeMaps) registerCodeMapTools(server, user)
  if (options.designRecords) registerDesignTools(server, user)
  if (options.designRecords && options.write) registerDesignProposalTool(server, user)

  return server
}

/** Conformance of the diagrams to the code, read from stored reviews and maps: no model call. */
function registerCodeMapTools(server: McpServer, user: User) {
  server.registerTool(
    McpTool.GetCodeConformance,
    {
      description:
        'How the diagrams of a project match its code. For each diagram: the open findings of the ' +
        'newest conformance review (status, severity, comment, evidence as code keys with ' +
        'path:line), and the findings of the deterministic match against the newest code map ' +
        '(level error or warning). Read before changing code a diagram describes.',
      inputSchema: getCodeConformanceInput,
      annotations: READ_ONLY,
    },
    async ({ projectId, diagramId }) => {
      const project = await findOwnedProject(projectId, user)
      if (!project) return failure('Project not found')
      const result = await getCodeConformance(project, user, diagramId)
      if (!result) return failure('Diagram not found')
      return json(result)
    },
  )

  server.registerTool(
    McpTool.ListUndocumentedProcesses,
    {
      description:
        "Lists the processes of a project's code that no diagram documents: the calls followed " +
        'from each entry point (route, job, command, handler) through code no diagram element ' +
        'is linked to, largest first, from the newest code map.',
      inputSchema: listUndocumentedProcessesInput,
      annotations: READ_ONLY,
    },
    async ({ projectId }) => {
      const project = await findOwnedProject(projectId, user)
      if (!project) return failure('Project not found')
      const result = await listUndocumentedProcesses(project, user)
      if (!result) return failure(NO_READY_MAP)
      return json(result)
    },
  )
}

/** Why a project's architecture is what it is, read from its stored records: no model call. */
function registerDesignTools(server: McpServer, user: User) {
  server.registerTool(
    McpTool.ListRequirements,
    {
      description:
        "Lists what a project's architecture has to hold: each requirement with its quality " +
        '(performance, availability, security, cost, evolvability, constraint), whether it must ' +
        'or should hold, and the measure that says it is met when there is one. Those that must ' +
        'hold come first. Read before a change that could break one.',
      inputSchema: listRequirementsInput,
      annotations: READ_ONLY,
    },
    async ({ projectId }) => {
      const project = await findOwnedProject(projectId, user)
      if (!project) return failure('Project not found')
      // A project holds at most a hundred: the list is whole.
      const requirements = await Requirement.query()
        .where('projectId', project.id)
        .orderBy('priority', 'asc')
        .orderBy('id', 'asc')
      return json(
        requirements.map(({ id, category, priority, statement, measure }) => ({
          id,
          category,
          priority,
          statement,
          measure,
        })),
      )
    },
  )

  server.registerTool(
    McpTool.ListDecisions,
    {
      description:
        'Lists the architecture decisions of a project: the question, the options weighed with ' +
        'what speaks for and against each, the one chosen, its consequences, its status ' +
        '(accepted: taken, keep to it; proposed: still open) and the ids of the requirements ' +
        '(list_requirements) and diagrams (list_diagrams) it is about, and the parts of those ' +
        'diagrams it names (an element, a relation, a member or a step, by the diagram id and ' +
        'the one line that names it there). Read before a change to ' +
        'the architecture, and stop and ask before going against an accepted one. Decisions ' +
        'sent with propose_decision are left out until the owner keeps them.',
      inputSchema: listDecisionsInput,
      annotations: READ_ONLY,
    },
    async ({ projectId, includeSuperseded }) => {
      const project = await findOwnedProject(projectId, user)
      if (!project) return failure('Project not found')
      const query = withLinks(reviewed(Decision.query().where('projectId', project.id)))
      if (!includeSuperseded) query.whereNot('status', DecisionStatus.Superseded)
      const decisions = await query.orderBy('status', 'asc').orderBy('id', 'asc')
      return json(
        decisions.map((decision) => ({
          id: decision.id,
          title: decision.title,
          status: decision.status,
          context: decision.context,
          options: decision.options,
          chosen: decision.chosen,
          consequences: decision.consequences,
          supersededById: decision.supersededById,
          requirementIds: decision.requirements.map((requirement) => requirement.id),
          diagramIds: decision.diagrams.map((diagram) => diagram.id),
          parts: serializeParts(decision),
        })),
      )
    },
  )
}

/**
 * What a coding agent tells the owner when the recorded design does not hold: a decision stored
 * `proposed` with `origin: agent`, whatever the agent sends, that counts for nothing until the
 * owner keeps it on the project's Design tab. It never marks another decision superseded.
 */
function registerDesignProposalTool(server: McpServer, user: User) {
  server.registerTool(
    McpTool.ProposeDecision,
    {
      description:
        'Tells the owner of a project that you had to deviate from its recorded design: use it ' +
        'when a decision (list_decisions) or a diagram (list_diagrams) did not fit the code and ' +
        'you went another way, or when you took a structuring decision nothing records. Give the ' +
        'question, the options you weighed, the one you went with and what it costs; name in ' +
        'supersedesId the decision that no longer holds, if any. It is stored as a proposal the ' +
        'owner reviews: until the owner keeps it, it counts for nothing and no tool lists it.',
      inputSchema: proposeDecisionInput,
      annotations: PROPOSES,
    },
    async ({ projectId, ...fields }) => {
      const project = await findOwnedProject(projectId, user)
      if (!project) return failure('Project not found')
      // Counted before the insert: two calls at once may pass the cap by one, which is harmless.
      if ((await waitingProposals(project.id)) >= AGENT_PROPOSALS_WAITING_MAX)
        return failure(PROPOSALS_WAITING)
      const decision = await createDecision(project, {
        ...fields,
        status: DecisionStatus.Proposed,
        origin: DecisionOrigin.Agent,
      })
      if (decision === 'full') return failure(DECISIONS_FULL.error.message)
      if ('refused' in decision) return failure(decision.refused.error.message)
      return json({
        id: decision.id,
        status: decision.status,
        review:
          "Waiting for the owner's review: it counts for nothing, and list_decisions leaves it " +
          'out, until the owner keeps it.',
      })
    },
  )
}
