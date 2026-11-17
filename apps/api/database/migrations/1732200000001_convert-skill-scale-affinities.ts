import { BaseSchema } from '@adonisjs/lucid/schema'

type StoredAffinity = Record<string, unknown> & { slot?: string }
type Scale = { min: number; max: number }

/** The slot whose agreeing side holds a second rule. */
const AUTONOMY_SLOT = 'workflow.autonomy'

/**
 * A scale affinity (`{ slot, scale: { min, max } }`) as the rules it fits and goes against: the
 * agreeing side from 4 up, the disagreeing side up to 2, nothing in between. Any other affinity
 * is kept as it is.
 */
export function convertScaleAffinity(affinity: StoredAffinity): StoredAffinity | null {
  const scale = affinity.scale as Scale | undefined
  if (!scale) return affinity
  if (scale.min >= 4) {
    return {
      slot: affinity.slot,
      values: affinity.slot === AUTONOMY_SLOT ? ['agree', 'ask-before-writing'] : ['agree'],
      against: ['disagree'],
    }
  }
  if (scale.max <= 2) return { slot: affinity.slot, values: ['disagree'], against: ['agree'] }
  return null
}

/** The reverse, for the affinities the conversion wrote; the dropped ones do not come back. */
export function restoreScaleAffinity(affinity: StoredAffinity): StoredAffinity {
  const values = affinity.values as string[] | undefined
  const against = affinity.against as string[] | undefined
  if (values?.includes('agree') && against?.includes('disagree')) {
    return { slot: affinity.slot, scale: { min: 4, max: 5 } }
  }
  if (values?.includes('disagree') && against?.includes('agree')) {
    return { slot: affinity.slot, scale: { min: 1, max: 2 } }
  }
  return affinity
}

/**
 * Skills hold their affinities as JSON: the ones written against a scale question are rewritten
 * against the ready-made rules that replace it. A skill left without any affinity stays
 * catalogued and is no longer suggested, like a found skill no query of the plan gives one to.
 */
export default class extends BaseSchema {
  protected tableName = 'skills'

  private rewrite(convert: (affinity: StoredAffinity) => StoredAffinity | null) {
    this.defer(async (db) => {
      const rows: { id: number; affinities: StoredAffinity[] }[] = await db
        .from(this.tableName)
        .select('id', 'affinities')
      for (const row of rows) {
        const affinities = row.affinities.flatMap((affinity) => convert(affinity) ?? [])
        if (JSON.stringify(affinities) === JSON.stringify(row.affinities)) continue
        await db
          .from(this.tableName)
          .where('id', row.id)
          .update({ affinities: JSON.stringify(affinities) })
      }
    })
  }

  async up() {
    this.rewrite(convertScaleAffinity)
  }

  async down() {
    this.rewrite(restoreScaleAffinity)
  }
}
