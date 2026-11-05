import Architecture from '#app/architectures/models/architecture'
import { assertOwner } from '#app/shared/authorization/assert-owner'
import type User from '#app/users/models/user'

export const ARCHITECTURE_NOT_FOUND = { error: { message: 'Architecture not found' } } as const

/**
 * The architecture with this id if `user` owns it, else null — callers answer
 * 404 either way (RM-17). `withDiagrams` preloads them in display order.
 */
export async function findOwnedArchitecture(
  id: number,
  user: User,
  { withDiagrams = false } = {},
): Promise<Architecture | null> {
  const query = Architecture.query().where('id', id)
  if (withDiagrams) query.preload('diagrams', (diagrams) => diagrams.orderBy('position', 'asc'))
  const architecture = await query.first()
  if (!architecture || !assertOwner(architecture, user)) return null
  return architecture
}
