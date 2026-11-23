import { z } from 'zod'
import { DECISION_LIMITS } from '#app/decisions/constants/decision'
import { DIAGRAM_FORMATS } from '#app/diagrams/constants/diagram'

// Tool arguments are zod shapes, not VineJS: the MCP SDK validates them and publishes them to
// the client as JSON Schema.
const id = () => z.number().int().positive()

export const listDiagramsInput = {
  projectId: id()
    .optional()
    .describe('A project id from list_projects. Leave out for diagrams outside any project.'),
}

export const getDiagramInput = {
  diagramId: id().describe('A diagram id from list_diagrams.'),
  format: z
    .enum(DIAGRAM_FORMATS)
    .optional()
    .describe('The text format to return. Defaults to the format the diagram was last edited in.'),
}

export const getAgentConventionsInput = {
  configId: id()
    .optional()
    .describe('An agent conventions id from list_agent_conventions. Pass this or projectId.'),
  projectId: id()
    .optional()
    .describe('A project id from list_projects, for the conventions of that project.'),
}

export const getCodeConformanceInput = {
  projectId: id().describe('A project id from list_projects.'),
  diagramId: id()
    .optional()
    .describe('A diagram id from list_diagrams, to read that diagram only. Leave out for all.'),
}

export const listRequirementsInput = {
  projectId: id().describe('A project id from list_projects.'),
}

export const listDecisionsInput = {
  projectId: id().describe('A project id from list_projects.'),
  includeSuperseded: z
    .boolean()
    .optional()
    .describe('Also list the decisions another one replaced. Left out, only those still standing.'),
}

export const listUndocumentedProcessesInput = {
  projectId: id().describe('A project id from list_projects.'),
}

const text = (max: number) => z.string().trim().max(max)
const ids = () => z.array(id()).max(DECISION_LIMITS.links)

/** The bounds of `createDecisionInput`. No status: a proposal is always `proposed`. */
export const proposeDecisionInput = {
  projectId: id().describe('A project id from list_projects.'),
  title: text(DECISION_LIMITS.titleLength).min(1).describe('The question decided.'),
  context: text(DECISION_LIMITS.textLength)
    .optional()
    .describe('Why the question came up: what in the code or the task made the design not hold.'),
  options: z
    .array(
      z.object({
        name: text(DECISION_LIMITS.optionNameLength).min(1),
        pros: text(DECISION_LIMITS.optionTextLength).optional().describe('What speaks for it.'),
        cons: text(DECISION_LIMITS.optionTextLength).optional().describe('What speaks against it.'),
      }),
    )
    .min(1)
    .max(DECISION_LIMITS.options)
    .describe('The options weighed, each named once.'),
  chosen: text(DECISION_LIMITS.optionNameLength)
    .min(1)
    .optional()
    .describe('The name of the option you went with, one of options.'),
  consequences: text(DECISION_LIMITS.textLength)
    .optional()
    .describe('What the choice costs or makes necessary.'),
  requirementIds: ids().optional().describe('Requirements of the project (list_requirements).'),
  diagramIds: ids().optional().describe('Diagrams of the project it shapes (list_diagrams).'),
  supersedesId: id()
    .optional()
    .describe(
      'A decision of the project (list_decisions) this one says no longer holds. Only named for the owner: it stays as it is.',
    ),
}
