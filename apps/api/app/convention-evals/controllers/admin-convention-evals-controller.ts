import type { HttpContext } from '@adonisjs/core/http'
import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import {
  CONVENTION_EVAL_CAP_USD,
  CONVENTION_EVALS_NOT_FOUND,
} from '#app/convention-evals/constants/convention-evals'
import { evalCapUsd, saveEvalCapUsd } from '#app/convention-evals/services/eval-settings'
import { saveConventionEvalSettingsInput } from '#app/convention-evals/validators/convention-evals-input'
import type { ConventionEvalSettingsOutput } from '#app/convention-evals/validators/convention-evals-output'
import { isFeatureEnabled } from '#app/feature-flags/services/feature-flags'

const output = (capUsd: number): ConventionEvalSettingsOutput => ({
  capUsd,
  minCapUsd: CONVENTION_EVAL_CAP_USD.min,
  maxCapUsd: CONVENTION_EVAL_CAP_USD.max,
})

/**
 * The instance's convention test settings, for the admin (`middleware.admin()`), behind the
 * `convention-evals` flag (404 while off): the cap of a new run, in US dollars.
 */
export default class AdminConventionEvalsController {
  /** `GET /admin/convention-evals` */
  async show({ auth, response }: HttpContext) {
    if (!(await isFeatureEnabled(FeatureFlagKey.ConventionEvals, auth.getUserOrFail()))) {
      return response.notFound(CONVENTION_EVALS_NOT_FOUND)
    }
    return response.ok(output(await evalCapUsd()))
  }

  /** `PUT /admin/convention-evals` `{ capUsd }`: the cap of every run started from now on. */
  async update({ auth, request, response }: HttpContext) {
    if (!(await isFeatureEnabled(FeatureFlagKey.ConventionEvals, auth.getUserOrFail()))) {
      return response.notFound(CONVENTION_EVALS_NOT_FOUND)
    }
    const { capUsd } = await request.validateUsing(saveConventionEvalSettingsInput)
    return response.ok(output(await saveEvalCapUsd(capUsd)))
  }
}
