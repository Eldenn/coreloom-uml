import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'

/* Helpers to prove a secret (a key, a token, a code) never leaks into a log line or a table. */

/** Every line logged during a test, serialized. */
export function captureLogs() {
  const lines: string[] = []
  const methods = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const
  const originals = methods.map((method) => [method, logger[method]] as const)
  for (const method of methods) {
    ;(logger as unknown as Record<string, (...args: unknown[]) => void>)[method] = (
      ...args: unknown[]
    ) => {
      lines.push(
        JSON.stringify(args, (_key, value) => (value instanceof Error ? String(value) : value)),
      )
    }
  }
  return {
    lines,
    restore: () => {
      for (const [method, original] of originals) {
        ;(logger as unknown as Record<string, unknown>)[method] = original
      }
    },
  }
}

/** The whole database, serialized. */
export async function dumpDatabase() {
  const tables = await db
    .from('information_schema.tables')
    .where('table_schema', 'public')
    .where('table_type', 'BASE TABLE')
    .select('table_name')
  const rows: unknown[] = []
  for (const { table_name: table } of tables) rows.push(await db.from(table).select('*'))
  return JSON.stringify(rows)
}
