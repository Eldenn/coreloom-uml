import type Project from '#app/projects/models/project'
import type { ProjectOutput } from '#app/projects/validators/projects-output'

/** Expects the `architectures_count` extra (`withCount('architectures')`); 0 without it. */
export function serializeProject(project: Project): ProjectOutput {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    architectureCount: Number(project.$extras.architectures_count ?? 0),
    createdAt: project.createdAt.toISO() ?? '',
    updatedAt: project.updatedAt.toISO() ?? '',
  }
}
