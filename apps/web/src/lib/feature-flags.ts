// Feature flags: which ones are on for the signed-in user (`GET /features`), and the admin's view
// and edits (`/admin/feature-flags`, the default account only). Flags are declared in
// `@coreloom-uml/feature-flags`; the API enforces them, this only hides what is off.
import type { FeatureFlagKey, FeatureFlagState } from '@coreloom-uml/feature-flags'
import { useMutation, useQuery } from '@tanstack/react-query'

import { client } from '@/lib/client'
import { queryClient } from '@/lib/query'

export type AdminFeatureFlags = Awaited<ReturnType<typeof client.api.admin.featureFlags.index>>
export type AdminFeatureFlag = AdminFeatureFlags['flags'][number]

const FEATURES_KEY = ['features'] as const
const ADMIN_KEY = ['admin', 'feature-flags'] as const

export function useFeatures() {
  return useQuery({
    queryKey: FEATURES_KEY,
    queryFn: async () => (await client.api.features.index({})).flags,
  })
}

/** Whether a flag is on for the signed-in user; off while loading or when the call fails. */
export function useFeature(key: FeatureFlagKey): boolean {
  return useFeatures().data?.[key] ?? false
}

export function useAdminFeatureFlags(enabled: boolean) {
  return useQuery({
    queryKey: ADMIN_KEY,
    queryFn: () => client.api.admin.featureFlags.index({}),
    enabled,
  })
}

export function useUpdateFeatureFlag() {
  return useMutation({
    mutationFn: ({ key, state }: { key: FeatureFlagKey; state: FeatureFlagState }) =>
      client.api.admin.featureFlags.update({ params: { key }, body: { state } }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: FEATURES_KEY }),
        queryClient.invalidateQueries({ queryKey: ADMIN_KEY }),
      ]),
  })
}
