// Where GitHub sends the admin back once the GitHub App is created from its manifest
// (`?code=…&state=…`, the manifest's redirect URL): the code is handed to the API, which keeps
// the App and its secrets, then the settings show it.
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import * as React from 'react'
import { z } from 'zod'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/sonner'
import { Spinner } from '@/components/ui/spinner'
import { getErrorMessage } from '@/lib/client'
import { useCompleteGithubApp } from '@/lib/github-app'
import { useT } from '@/lib/locale'

export const Route = createFileRoute('/_authed/github/app-created')({
  validateSearch: z.object({
    code: z.string().optional().catch(undefined),
    state: z.string().optional().catch(undefined),
  }),
  staticData: { crumb: (t) => t.githubApp.title },
  component: GithubAppCreatedPage,
})

function GithubAppCreatedPage() {
  const t = useT()
  const router = useRouter()
  const { code, state } = Route.useSearch()
  const complete = useCompleteGithubApp()
  // GitHub's code is good once: the request is sent once, whatever React renders.
  const sent = React.useRef(false)

  React.useEffect(() => {
    if (sent.current || !code || !state) return
    sent.current = true
    complete.mutate(
      { code, state },
      {
        onSuccess: () => {
          toast.success(t.githubApp.created)
          router.history.replace('/settings')
        },
      },
    )
  }, [code, state, complete, router, t])

  if (code && state && !complete.error) {
    return (
      <p role="status" className="flex items-center gap-2 text-muted-foreground">
        <Spinner /> {t.githubApp.saving}
      </p>
    )
  }
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Alert variant="destructive">
        <AlertTitle>{t.githubApp.createFailed}</AlertTitle>
        <AlertDescription>
          {complete.error
            ? getErrorMessage(complete.error, t.githubApp.createFailed)
            : t.githubApp.nothingBack}
        </AlertDescription>
      </Alert>
      <Button className="w-fit" asChild>
        <Link to="/settings">{t.githubApp.backToSettings}</Link>
      </Button>
    </div>
  )
}
