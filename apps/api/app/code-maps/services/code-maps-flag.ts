import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { isFeatureEnabled } from '#app/feature-flags/services/feature-flags'
import type User from '#app/users/models/user'

export const CODE_MAPS_NOT_FOUND = { error: { message: 'Not found' } } as const

/** Every code map route answers 404 while this is false for the user. */
export function codeMapsEnabled(user: User): Promise<boolean> {
  return isFeatureEnabled(FeatureFlagKey.CodeMaps, user)
}
