import { z } from 'zod'
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
