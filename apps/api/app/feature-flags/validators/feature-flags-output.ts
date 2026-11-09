import type { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import type { AdminFeatureFlag } from '#app/feature-flags/services/feature-flags'

/** `GET /features`: every declared flag, evaluated for the caller. */
export type FeaturesOutput = { flags: Record<FeatureFlagKey, boolean> }

/** `GET /admin/feature-flags`: every declared flag with its state and recent history. */
export type AdminFeatureFlagsOutput = { environment: string; flags: AdminFeatureFlag[] }

/** `PUT /admin/feature-flags/:key`: the flag as it now stands. */
export type AdminFeatureFlagOutput = { flag: AdminFeatureFlag }
