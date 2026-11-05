import type Architecture from '#app/architectures/models/architecture'
import { readAccessCode, shareLink } from '#app/sharing/services/sharing'
import type {
  SharedArchitectureOutput,
  SharingOutput,
} from '#app/sharing/validators/sharing-output'

export function serializeSharing(architecture: Architecture): SharingOutput {
  return {
    visibility: architecture.visibility,
    link: shareLink(architecture),
    code: readAccessCode(architecture),
  }
}

/** Expects `diagrams` preloaded, ordered by position. */
export function serializeSharedArchitecture(architecture: Architecture): SharedArchitectureOutput {
  return {
    title: architecture.title,
    description: architecture.description,
    updatedAt: architecture.updatedAt.toISO() ?? '',
    diagrams: architecture.diagrams.map((diagram) => ({
      id: diagram.id,
      title: diagram.title,
      kind: diagram.kind,
      content: diagram.content,
      position: diagram.position,
    })),
  }
}
