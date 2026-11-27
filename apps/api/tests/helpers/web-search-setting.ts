import db from '@adonisjs/lucid/services/db'

const TABLE = 'web_search_settings'

/**
 * For a group's `setup`: the test database is the developer's own, and this table holds the
 * instance's one service. Keeps its rows as Postgres wrote them (`row_to_json`, so every column,
 * the sealed key and the timestamps to the microsecond, come back the same), empties the table for
 * the group, and puts the rows back in the teardown, which runs even when a test failed.
 */
export async function keepWebSearchSetting(): Promise<() => Promise<void>> {
  const { rows } = await db.rawQuery<{ rows: { row: string }[] }>(
    `select row_to_json(t)::text as row from ${TABLE} t`,
  )
  await db.from(TABLE).delete()
  return async () => {
    await db.from(TABLE).delete()
    for (const { row } of rows) {
      await db.rawQuery(
        `insert into ${TABLE} select * from json_populate_record(null::${TABLE}, ?::json)`,
        [row],
      )
    }
  }
}
