import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type CodeMap from '#app/code-maps/models/code-map'
import { deleteCodeMapFiles } from '#app/code-maps/services/code-map-storage'

/**
 * `DELETE /code-maps/:id`: the row (its proposed diagrams go with it; the diagrams' links stay,
 * they outlive maps), in `client` when given. Answers the deletion of its file, to run once the
 * row is gone for good: a file cannot be rolled back.
 */
export async function deleteCodeMap(
  codeMap: CodeMap,
  client?: TransactionClientContract,
): Promise<() => Promise<void>> {
  if (client) codeMap.useTransaction(client)
  await codeMap.delete()
  return () => deleteCodeMapFiles([codeMap.storageKey])
}
