import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'

/**
 * A global transaction that starts with no stored flag state, so every flag is at its declared
 * default whatever the database holds (a dev database may have flags turned on). Rolled back with
 * the rest of the test.
 */
export async function withDefaultFlags() {
  const rollback = await testUtils.db().withGlobalTransaction()
  await db.from('feature_flag_changes').delete()
  await db.from('feature_flags').delete()
  return rollback
}
