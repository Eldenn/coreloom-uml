// The tech watch: articles read every day from the feeds and web searches the admin picks, behind
// the `tech-watch` flag. The filters and the page are in the URL, so a view can be shared; the
// admin also manages the sources and, from an article's sheet, its tags and visibility.
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { RefreshCwIcon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { useAuth } from '@/auth/auth-context'
import { PageHeader } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/sonner'
import { TuyauError } from '@/lib/client'
import { useFeature } from '@/lib/feature-flags'
import { useT } from '@/lib/locale'
import { useRefreshWatch, type WatchArticle } from '@/lib/watch'
import { WatchArticleSheet } from '@/watch/watch-article-sheet'
import { WatchArticles } from '@/watch/watch-articles'
import type { WatchSearch } from '@/watch/watch-query'
import { WatchSourcesButton } from '@/watch/watch-sources'

/** A URL parameter: kept as text (the router reads `2` as a number), dropped when malformed. */
const param = z.union([z.string(), z.number()]).transform(String).optional().catch(undefined)

const searchSchema = z.object({
  q: param,
  topic: param,
  since: param,
  untagged: param,
  hidden: param,
  page: param,
})

export const Route = createFileRoute('/_authed/watch')({
  validateSearch: searchSchema,
  staticData: { crumb: (t) => t.nav.watch },
  component: WatchPage,
})

function RefreshButton() {
  const t = useT().watch.admin
  const refresh = useRefreshWatch()
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={refresh.isPending}
      onClick={() => {
        refresh.mutate(undefined, {
          onSuccess: () => toast.success(t.refreshQueued),
          onError: (error) =>
            error instanceof TuyauError && error.status === 409
              ? toast.info(t.refreshRunning)
              : toast.error(t.refreshFailed),
        })
      }}
    >
      <RefreshCwIcon /> {t.refresh}
    </Button>
  )
}

function WatchPage() {
  const t = useT().watch
  const enabled = useFeature('tech-watch')
  const navigate = useNavigate({ from: Route.fullPath })
  const search = Route.useSearch()
  const { user } = useAuth()
  const isAdmin = user?.isAdmin ?? false
  const [article, setArticle] = React.useState<WatchArticle | null>(null)

  // The API answers 404 while the flag is off: the page shows nothing either.
  if (!enabled) return null

  return (
    <>
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <WatchSourcesButton />
              <RefreshButton />
            </div>
          )
        }
      />
      <WatchArticles
        search={search}
        isAdmin={isAdmin}
        onSearchChange={(next: WatchSearch) => void navigate({ search: next, replace: true })}
        onManage={isAdmin ? setArticle : undefined}
      />
      {isAdmin && (
        <WatchArticleSheet
          article={article}
          onClose={() => {
            setArticle(null)
          }}
          onChange={setArticle}
        />
      )}
    </>
  )
}
