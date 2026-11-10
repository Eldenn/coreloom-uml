import { FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { isFeatureEnabled } from '#app/feature-flags/services/feature-flags'
import type User from '#app/users/models/user'

export const ASSISTANT_NOT_FOUND = { error: { message: 'Not found' } } as const

/** Every assistant route answers 404 while this is false for the user. */
export function assistantEnabled(user: User): Promise<boolean> {
  return isFeatureEnabled(FeatureFlagKey.DiagramAssistant, user)
}
