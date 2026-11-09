// The admin's feature flags: coreloom-ui's FeatureFlags block on the API's flags. Only the
// default account (`user.isAdmin`) gets here; the API refuses everyone else anyway.
import { FEATURE_FLAG_ENVIRONMENT, type FeatureFlagKey } from '@coreloom-uml/feature-flags'
import { createFileRoute, redirect } from '@tanstack/react-router'

import { meQueryOptions } from '@/auth/auth-context'
import { PageHeader } from '@/components/app-shell'
import { type FeatureFlag, FeatureFlags } from '@/components/feature-flags'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from '@/components/ui/sonner'
import {
  type AdminFeatureFlag,
  useAdminFeatureFlags,
  useUpdateFeatureFlag,
} from '@/lib/feature-flags'
import { useT } from '@/lib/locale'

export const Route = createFileRoute('/_authed/feature-flags')({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.query({ ...meQueryOptions, staleTime: 'static' })
    if (!user?.isAdmin) throw redirect({ to: '/projects', replace: true })
  },
  staticData: { crumb: (t) => t.nav.featureFlags },
  component: FeatureFlagsPage,
})

function toBlockFlag(flag: AdminFeatureFlag): FeatureFlag {
  return {
    key: flag.key,
    name: flag.name,
    description: flag.description,
    tags: flag.tags,
    environments: { [FEATURE_FLAG_ENVIRONMENT]: flag.state },
    history: flag.history.map((change) => ({
      id: String(change.id),
      at: new Date(change.at),
      author: change.author ?? undefined,
      environment: FEATURE_FLAG_ENVIRONMENT,
      text: change.text,
    })),
  }
}

function FeatureFlagsPage() {
  const t = useT()
  const flags = useAdminFeatureFlags(true)
  const update = useUpdateFeatureFlag()

  return (
    <>
      <PageHeader title={t.featureFlags.title} description={t.featureFlags.description} />
      {flags.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t.featureFlags.loadFailed}</AlertDescription>
        </Alert>
      )}
      {flags.data && (
        <FeatureFlags
          flags={flags.data.flags.map(toBlockFlag)}
          environments={[{ id: FEATURE_FLAG_ENVIRONMENT, name: t.featureFlags.environment }]}
          attributes={[
            { value: 'email', label: t.featureFlags.attributeEmail },
            { value: 'id', label: t.featureFlags.attributeId },
          ]}
          onChange={(key, _environment, state) =>
            update
              .mutateAsync({ key: key as FeatureFlagKey, state })
              .catch(() => toast.error(t.featureFlags.saveFailed))
          }
        />
      )}
    </>
  )
}
