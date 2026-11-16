import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { CODE_MAP_LIMITS } from '#app/code-maps/constants/code-map'
import CodeMap from '#app/code-maps/models/code-map'

/**
 * Deletes the project's maps past its `CODE_MAP_LIMITS.perProject` newest, in the transaction
 * that adds one. Returns their storage keys: the caller deletes the files once it commits.
 */
export async function pruneCodeMaps(
  projectId: number,
  trx: TransactionClientContract,
): Promise<(string | null)[]> {
  const older = await CodeMap.query({ client: trx })
    .where('projectId', projectId)
    .orderBy('createdAt', 'desc')
    .orderBy('id', 'desc')
    .offset(CODE_MAP_LIMITS.perProject)
  if (older.length === 0) return []
  await CodeMap.query({ client: trx })
    .whereIn(
      'id',
      older.map((row) => row.id),
    )
    .delete()
  return older.map((row) => row.storageKey)
}
