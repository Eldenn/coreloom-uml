import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

export default class HealthController {
  async handle({ response }: HttpContext) {
    const dbOk = await db
      .rawQuery('SELECT 1')
      .then(() => true)
      .catch(() => false)

    const body = {
      status: dbOk ? ('ok' as const) : ('degraded' as const),
      services: { db: dbOk ? ('ok' as const) : ('error' as const) },
    }

    return dbOk ? response.ok(body) : response.serviceUnavailable(body)
  }
}
