import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'

import { useAuth } from '@/auth/auth-context'
import { AuthLayout } from '@/components/auth-layout'
import { Brand } from '@/components/brand'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { client } from '@/lib/client'
import { useT } from '@/lib/locale'

// The page the verification email links to: /verify-email?token=…
export const Route = createFileRoute('/verify-email')({
  validateSearch: z.object({ token: z.string().catch('') }),
  component: VerifyEmailPage,
})

function VerifyEmailPage() {
  const t = useT()
  const { token } = Route.useSearch()
  const { user, refresh } = useAuth()
  const verify = useQuery({
    queryKey: ['auth', 'verify-email', token],
    queryFn: async () => {
      await client.api.auth.verifyEmail({ query: { token } })
      await refresh()
      return true
    },
    enabled: token !== '',
    retry: false,
    staleTime: Infinity,
  })

  return (
    <AuthLayout brand={<Brand />}>
      <div className="flex flex-col gap-4">
        {verify.isPending && token !== '' ? (
          <p role="status" className="flex items-center gap-2 text-muted-foreground">
            <Spinner /> {t.verify.checking}
          </p>
        ) : (
          <Alert variant={verify.isSuccess ? 'success' : 'destructive'}>
            <AlertDescription>
              {verify.isSuccess ? t.verify.done : t.verify.failed}
            </AlertDescription>
          </Alert>
        )}
        <Button asChild>
          <Link to={user ? '/projects' : '/login'}>{t.verify.continue}</Link>
        </Button>
      </div>
    </AuthLayout>
  )
}
