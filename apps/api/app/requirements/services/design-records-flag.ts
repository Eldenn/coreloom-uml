import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { isFeatureEnabled } from '#app/feature-flags/services/feature-flags'
import type User from '#app/users/models/user'

export const DESIGN_RECORDS_NOT_FOUND = { error: { message: 'Not found' } } as const

/** Every requirement and decision route answers 404 while this is false for the user. */
export function designRecordsEnabled(user: User): Promise<boolean> {
  return isFeatureEnabled(FeatureFlagKey.DesignRecords, user)
}
