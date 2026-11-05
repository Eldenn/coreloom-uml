import { authApiClient } from '@adonisjs/auth/plugins/api_client'
import app from '@adonisjs/core/services/app'
import testUtils from '@adonisjs/core/services/test_utils'
import limiter from '@adonisjs/limiter/services/main'
import { sessionApiClient } from '@adonisjs/session/plugins/api_client'
import { apiClient } from '@japa/api-client'
import { assert } from '@japa/assert'
import { pluginAdonisJS } from '@japa/plugin-adonisjs'
import type { Config } from '@japa/runner/types'

export const plugins: Config['plugins'] = [
  assert(),
  apiClient(),
  pluginAdonisJS(app),
  sessionApiClient(app),
  authApiClient(app),
]

export const reporters: Config['reporters'] = {
  activated: ['spec'],
}

/**
 * Start the in-process HTTP server for suites that exercise routes through the
 * API client (functional). Unit tests don't need it.
 */
export const configureSuite: Config['configureSuite'] = (suite) => {
  if (suite.name === 'functional') {
    suite.setup(() => testUtils.httpServer().start())
    // Every functional test shares the same in-memory limiter store and the
    // same client "IP", so without a reset, later tests would inherit
    // earlier tests' rate-limit usage instead of each other's isolated state.
    suite.onGroup((group) => {
      group.each.setup(() => {
        return () => limiter.clear()
      })
    })
  }
}
