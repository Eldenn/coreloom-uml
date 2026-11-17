import CodeMap from '#app/code-maps/models/code-map'
import { assertOwner } from '#app/shared/authorization/assert-owner'
import type User from '#app/users/models/user'

export const CODE_MAP_NOT_FOUND = { error: { message: 'Code map not found' } } as const

/** The code map with this id if `user` owns it, else null: callers answer 404 either way. */
export async function findOwnedCodeMap(id: number, user: User): Promise<CodeMap | null> {
  const codeMap = await CodeMap.find(id)
  if (!codeMap || !assertOwner(codeMap, user)) return null
  return codeMap
}
