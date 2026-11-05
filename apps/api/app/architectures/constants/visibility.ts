/** Who can open an architecture (business rules RM-20 to RM-29). */
export const ArchitectureVisibility = {
  /** The owner only. The default. */
  Private: 'private',
  /** Anyone with the share link. */
  Public: 'public',
  /** Anyone with the share link and the access code. */
  Protected: 'protected',
} as const
export type ArchitectureVisibility =
  (typeof ArchitectureVisibility)[keyof typeof ArchitectureVisibility]

export const ARCHITECTURE_VISIBILITIES = Object.values(ArchitectureVisibility)
