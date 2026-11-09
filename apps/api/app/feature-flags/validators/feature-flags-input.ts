import { FEATURE_FLAG_LIMITS, FLAG_ATTRIBUTES, FLAG_OPERATORS } from '@coreloom-uml/feature-flags'
import vine from '@vinejs/vine'

/**
 * `PUT /admin/feature-flags/:key`: a flag's new state, bounded like `featureFlagStateSchema`
 * (which the controller also applies, so both agree).
 */
export const updateFeatureFlagInput = vine.create(
  vine.object({
    state: vine.object({
      enabled: vine.boolean(),
      rollout: vine.number().withoutDecimals().min(0).max(100),
      rules: vine
        .array(
          vine.object({
            id: vine.string().minLength(1).maxLength(FEATURE_FLAG_LIMITS.ruleIdLength),
            attribute: vine.enum(FLAG_ATTRIBUTES),
            operator: vine.enum(FLAG_OPERATORS),
            values: vine
              .array(vine.string().maxLength(FEATURE_FLAG_LIMITS.valueLength))
              .maxLength(FEATURE_FLAG_LIMITS.values),
            serve: vine.boolean(),
          }),
        )
        .maxLength(FEATURE_FLAG_LIMITS.rules),
    }),
  }),
)
