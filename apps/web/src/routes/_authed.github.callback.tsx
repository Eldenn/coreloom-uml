// Where GitHub sends the browser back: after its authorization page (`?code=…&state=…`, the
// GitHub App's callback URL), or after the App was installed or its repositories changed
// (`?installation_id=…&setup_action=…`, the App's setup URL), when the authorization follows.
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import * as React from 'react'
import { z } from 'zod'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { getErrorMessage } from '@/lib/client'
import { useCompleteGithubConnection, useStartGithubConnection } from '@/lib/github'
import { useT } from '@/lib/locale'

export const Route = createFileRoute('/_authed/github/callback')({
  validateSearch: z.object({
    code: z.string().optional().catch(undefined),
    state: z.string().optional().catch(undefined),
    setup_action: z.string().optional().catch(undefined),
  }),
  staticData: { crumb: (t) => t.github.callbackTitle },
  component: GithubCallbackPage,
})

function GithubCallbackPage() {
  const t = useT()
  const router = useRouter()
  const { code, state, setup_action: setupAction } = Route.useSearch()
  const complete = useCompleteGithubConnection()
  const start = useStartGithubConnection()
  // GitHub's code is good once: the request is sent once, whatever React renders.
  const sent = React.useRef(false)

  React.useEffect(() => {
    if (sent.current) return
    sent.current = true
    if (code && state) {
      complete.mutate(
        { code, state },
        { onSuccess: ({ returnTo }) => router.history.replace(returnTo) },
      )
    } else if (setupAction) {
      // Installed (or changed) on GitHub: the authorization lists what the user now reaches.
      start.mutate({ target: 'authorize', ...(state ? { state } : {}) })
    }
  }, [code, state, setupAction, complete, start, router])

  const error = complete.error ?? start.error
  const nothing = !(code && state) && !setupAction
  if (!error && !nothing) {
    return (
      <p role="status" className="flex items-center gap-2 text-muted-foreground">
        <Spinner /> {t.github.connecting}
      </p>
    )
  }
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Alert variant="destructive">
        <AlertTitle>{t.github.callbackFailed}</AlertTitle>
        <AlertDescription>
          {error ? getErrorMessage(error, t.github.callbackFailed) : t.github.callbackEmpty}
        </AlertDescription>
      </Alert>
      <Button className="w-fit" asChild>
        <Link to="/projects">{t.github.backToProjects}</Link>
      </Button>
    </div>
  )
}
