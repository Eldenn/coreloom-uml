import CodeMapSuggestion from '#app/code-maps/models/code-map-suggestion'
import { assertOwner } from '#app/shared/authorization/assert-owner'
import type User from '#app/users/models/user'

export const SUGGESTION_NOT_FOUND = { error: { message: 'Proposal not found' } } as const

/** The proposal with this id if `user` owns its code map, else null: callers answer 404. */
export async function findOwnedSuggestion(
  id: number,
  user: User,
): Promise<CodeMapSuggestion | null> {
  const suggestion = await CodeMapSuggestion.query().where('id', id).preload('codeMap').first()
  if (!suggestion || !assertOwner(suggestion.codeMap, user)) return null
  return suggestion
}
