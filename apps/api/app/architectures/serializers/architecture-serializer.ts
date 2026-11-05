import type Architecture from '#app/architectures/models/architecture'
import type {
  ArchitectureDetailOutput,
  ArchitectureOutput,
  ArchitectureSummaryOutput,
} from '#app/architectures/validators/architectures-output'
import { serializeDiagram } from '#app/diagrams/serializers/diagram-serializer'

export function serializeArchitecture(architecture: Architecture): ArchitectureOutput {
  return {
    id: architecture.id,
    title: architecture.title,
    description: architecture.description,
    visibility: architecture.visibility,
    createdAt: architecture.createdAt.toISO() ?? '',
    updatedAt: architecture.updatedAt.toISO() ?? '',
  }
}

/** Expects `diagrams` preloaded, ordered by position. */
export function serializeArchitectureSummary(
  architecture: Architecture,
): ArchitectureSummaryOutput {
  const [first] = architecture.diagrams
  return {
    ...serializeArchitecture(architecture),
    diagramCount: architecture.diagrams.length,
    cover: first ? { kind: first.kind, content: first.content } : null,
  }
}

/** Expects `diagrams` preloaded, ordered by position. */
export function serializeArchitectureDetail(architecture: Architecture): ArchitectureDetailOutput {
  return {
    ...serializeArchitecture(architecture),
    diagrams: architecture.diagrams.map(serializeDiagram),
  }
}
