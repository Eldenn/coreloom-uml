import type { HttpContext } from '@adonisjs/core/http'
import {
  FEATURE_FLAG_ENVIRONMENT,
  featureFlagStateSchema,
  isFeatureFlagKey,
} from '@coreloom-uml/feature-flags'
import { listForAdmin, updateFlag } from '#app/feature-flags/services/feature-flags'
import { updateFeatureFlagInput } from '#app/feature-flags/validators/feature-flags-input'
import type {
  AdminFeatureFlagOutput,
  AdminFeatureFlagsOutput,
} from '#app/feature-flags/validators/feature-flags-output'

const FLAG_NOT_FOUND = { error: { message: 'Feature flag not found' } }

/** The admin screen's flags (`middleware.admin()`): list them, change one's state. */
export default class AdminFeatureFlagsController {
  async index({ response }: HttpContext) {
    const output: AdminFeatureFlagsOutput = {
      environment: FEATURE_FLAG_ENVIRONMENT,
      flags: await listForAdmin(),
    }
    return response.ok(output)
  }

  async update({ auth, params, request, response }: HttpContext) {
    const key = String(params.key)
    if (!isFeatureFlagKey(key)) return response.notFound(FLAG_NOT_FOUND)
    const { state } = await request.validateUsing(updateFeatureFlagInput)
    await updateFlag(key, featureFlagStateSchema.parse(state), auth.getUserOrFail())
    const flag = (await listForAdmin()).find((f) => f.key === key)
    if (!flag) return response.notFound(FLAG_NOT_FOUND)
    const output: AdminFeatureFlagOutput = { flag }
    return response.ok(output)
  }
}
