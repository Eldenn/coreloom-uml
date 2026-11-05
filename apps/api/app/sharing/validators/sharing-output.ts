import type { ArchitectureVisibility } from '#app/architectures/constants/visibility'
import type { DiagramOutput } from '#app/diagrams/validators/diagrams-output'

/** What the owner sees in the share dialog. */
export type SharingOutput = {
  visibility: ArchitectureVisibility
  /** The web link, or null before the architecture was ever shared. */
  link: string | null
  /** The access code, only while protected (RM-23). */
  code: string | null
}

/** What a share-link visitor gets (RM-26): no owner, no ids of other things, no edit data. */
export type SharedArchitectureOutput = {
  title: string
  description: string | null
  updatedAt: string
  diagrams: Pick<DiagramOutput, 'id' | 'title' | 'kind' | 'content' | 'position'>[]
}
