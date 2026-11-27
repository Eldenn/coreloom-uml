import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { SkillScanStatus } from '#app/skills/constants/skill-scan'
import type { SkillScan } from '#app/skills/services/skill-scans'

/** A SkillSpector verdict that lets the admin approve a copy. */
export const CLEAN_SCAN: SkillScan = {
  status: SkillScanStatus.Done,
  score: 0,
  severity: 'LOW',
  recommendation: 'SAFE',
  complete: true,
  findings: [],
  moreFindings: 0,
  version: '2.13.7',
  scannedAt: '2026-11-24T00:00:00.000Z',
}

/**
 * A global transaction that starts with an empty skills catalog, whatever the database holds (a
 * dev database the weekly job has filled). Rolled back with the rest of the test.
 */
export async function withEmptySkillsCatalog() {
  const rollback = await testUtils.db().withGlobalTransaction()
  await db.from('skill_snapshots').delete()
  // Their scores, duplicates and reviews go with the skills; the rules' vectors and the run's state too.
  await db.from('skills').delete()
  await db.from('rule_embeddings').delete()
  await db.from('skill_scoring_state').delete()
  // Back to its registries, skills.sh and Smithery, as their migrations created them.
  await db.from('skill_sources').where('kind', 'github').delete()
  await db.from('skill_sources').update({ enabled: true, last_run_at: null, last_error: null })
  return rollback
}
