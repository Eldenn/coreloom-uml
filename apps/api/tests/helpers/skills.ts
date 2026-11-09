import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'

/**
 * A global transaction that starts with an empty skills catalog, whatever the database holds (a
 * dev database the weekly job has filled). Rolled back with the rest of the test.
 */
export async function withEmptySkillsCatalog() {
  const rollback = await testUtils.db().withGlobalTransaction()
  await db.from('skill_snapshots').delete()
  await db.from('skills').delete()
  return rollback
}
