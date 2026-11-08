import type Project from '#app/projects/models/project'
import type { ProjectOutput } from '#app/projects/validators/projects-output'

/**
 * Expects the `architectures_count` and `agent_configs_count` extras (the `withCount`s of
 * `findOwnedProject` and `ProjectsController.index`); 0 without them.
 */
export function serializeProject(project: Project): ProjectOutput {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    architectureCount: Number(project.$extras.architectures_count ?? 0),
    agentConfigCount: Number(project.$extras.agent_configs_count ?? 0),
    createdAt: project.createdAt.toISO() ?? '',
    updatedAt: project.updatedAt.toISO() ?? '',
  }
}
