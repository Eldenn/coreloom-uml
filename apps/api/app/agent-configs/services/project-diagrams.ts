import type { ArchitectureDiagram } from '@coreloom-uml/llm'
import { toPlantUml } from '@coreloom-uml/uml'
import type { AgentDiagramOutput } from '#app/agent-configs/validators/agent-configs-output'
import Diagram from '#app/diagrams/models/diagram'
import type Project from '#app/projects/models/project'

/** The project's diagrams that have content, architecture by architecture, in display order. */
function projectDiagramsQuery(project: Project) {
  return Diagram.query()
    .whereHas('architecture', (architecture) => architecture.where('projectId', project.id))
    .whereNotNull('content')
    .preload('architecture')
    .orderBy('architectureId', 'asc')
    .orderBy('position', 'asc')
    .orderBy('id', 'asc')
}

/** What the model can read from, without the content: for the owner to pick from. */
export async function listProjectDiagrams(project: Project): Promise<AgentDiagramOutput[]> {
  const diagrams = await projectDiagramsQuery(project).select(
    'id',
    'architecture_id',
    'title',
    'kind',
    'position',
  )
  return diagrams.map((diagram) => ({
    id: diagram.id,
    title: diagram.title,
    kind: diagram.kind,
    architecture: diagram.architecture.title,
  }))
}

/**
 * The project's diagrams as PlantUML without their layout: the listed ones in the listed order
 * (`notFound` when one is not a diagram with content of this project), or all of them.
 */
export async function readProjectDiagrams(
  project: Project,
  ids: number[] | undefined,
): Promise<ArchitectureDiagram[] | 'notFound'> {
  const query = projectDiagramsQuery(project)
  if (ids) query.whereIn('id', ids)
  const found = await query
  if (ids && found.length !== ids.length) return 'notFound'
  if (ids) found.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
  return found.flatMap((diagram) =>
    diagram.content
      ? [
          {
            id: diagram.id,
            kind: diagram.kind,
            title: diagram.title,
            architecture: diagram.architecture.title,
            text: toPlantUml(diagram.content, { layout: false }),
          },
        ]
      : [],
  )
}
