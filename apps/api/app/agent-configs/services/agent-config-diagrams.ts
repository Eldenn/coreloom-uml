import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import type { ArchitectureDiagram } from '@coreloom-uml/llm'
import { toPlantUml } from '@coreloom-uml/uml'
import type AgentConfig from '#app/agent-configs/models/agent-config'
import type { AgentDiagramOutput } from '#app/agent-configs/validators/agent-configs-output'
import Architecture from '#app/architectures/models/architecture'
import Diagram from '#app/diagrams/models/diagram'

/**
 * The architectures a configuration reads from: its project's, or, outside any project, the
 * owner's architectures that stand outside any project too.
 */
export function whereConfigArchitecture(
  query: ModelQueryBuilderContract<typeof Architecture>,
  config: AgentConfig,
) {
  return config.projectId === null
    ? query.where('userId', config.userId).whereNull('projectId')
    : query.where('projectId', config.projectId)
}

/** Its diagrams that have content, architecture by architecture, in display order. */
function configDiagramsQuery(config: AgentConfig) {
  return Diagram.query()
    .whereIn('architectureId', whereConfigArchitecture(Architecture.query().select('id'), config))
    .whereNotNull('content')
    .preload('architecture')
    .orderBy('architectureId', 'asc')
    .orderBy('position', 'asc')
    .orderBy('id', 'asc')
}

/** What the model can read from, without the content: for the owner to pick from. */
export async function listConfigDiagrams(config: AgentConfig): Promise<AgentDiagramOutput[]> {
  const diagrams = await configDiagramsQuery(config).select(
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
 * Its diagrams as PlantUML without their layout: the listed ones in the listed order
 * (`notFound` when one is not one of its diagrams with content), or all of them.
 */
export async function readConfigDiagrams(
  config: AgentConfig,
  ids: number[] | undefined,
): Promise<ArchitectureDiagram[] | 'notFound'> {
  const query = configDiagramsQuery(config)
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
