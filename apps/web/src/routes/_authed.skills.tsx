// The skills catalog: what the weekly search on skills.sh found, as a live dashboard and a ranked
// list. `?skill=<slug>` opens a skill's sheet; the list's search, filters, sort and page are in
// the URL too, so a view can be shared. The list comes first; `?view=overview` shows the trends.
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { SparklesIcon } from 'lucide-react'
import { z } from 'zod'

import { useAuth } from '@/auth/auth-context'
import { PageHeader } from '@/components/app-shell'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { RelativeTime } from '@/components/ui/relative-time'
import { toast } from '@/components/ui/sonner'
import { StatusIndicator } from '@/components/ui/status-indicator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useT } from '@/lib/locale'
import { type LiveStatus, useSkillsLiveUpdates, useSkillsStats } from '@/lib/skills'
import { SkillSheet } from '@/skills/skill-sheet'
import { SkillSourcesButton } from '@/skills/skill-sources'
import { SkillsAdminActions } from '@/skills/skills-admin'
import { SkillsCatalog } from '@/skills/skills-catalog'
import { SkillsFigures, SkillsTrends } from '@/skills/skills-overview'

/** A URL parameter: kept as text (the router reads `2` as a number), dropped when malformed. */
const param = z.union([z.string(), z.number()]).transform(String).optional().catch(undefined)

const searchSchema = z.object({
  q: param,
  topic: param,
  diagramKind: param,
  state: param,
  risk: param,
  copy: param,
  sort: param,
  page: param,
  skill: param,
  view: param,
})

type SkillsSearch = z.infer<typeof searchSchema>

export const Route = createFileRoute('/_authed/skills')({
  validateSearch: searchSchema,
  staticData: { crumb: (t) => t.nav.skills },
  component: SkillsPage,
})

const LIVE_TONES = { live: 'success', connecting: 'warning', offline: 'neutral' } as const

function LiveBadge({ status, lastRunAt }: { status: LiveStatus; lastRunAt: string | null }) {
  const t = useT().skills
  return (
    <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground">
      <span>
        {lastRunAt ? (
          <>
            {t.lastRun} · <RelativeTime date={lastRunAt} />
          </>
        ) : (
          t.neverRun
        )}
      </span>
      <StatusIndicator variant="pill" tone={LIVE_TONES[status]} pulse={status === 'live'}>
        {t[status]}
      </StatusIndicator>
    </div>
  )
}

function toParams(search: SkillsSearch) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) if (value) params.set(key, value)
  return params
}

function SkillsPage() {
  const t = useT()
  const navigate = useNavigate({ from: Route.fullPath })
  const search = Route.useSearch()
  const { user } = useAuth()
  const stats = useSkillsStats()
  const live = useSkillsLiveUpdates(() => toast.info(t.skills.catalogChanged))

  const setSearch = (next: SkillsSearch) => void navigate({ search: next, replace: true })
  const open = (slug: string) => {
    setSearch({ ...search, skill: slug })
  }
  const close = () => {
    setSearch({ ...search, skill: undefined })
  }
  const isEmpty = stats.data?.totals.skills === 0

  return (
    <>
      <PageHeader
        title={t.skills.title}
        description={t.skills.description}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <LiveBadge status={live} lastRunAt={stats.data?.lastRunAt ?? null} />
            {user?.isAdmin && (
              <>
                <SkillSourcesButton />
                <SkillsAdminActions />
              </>
            )}
          </div>
        }
      />
      {stats.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t.skills.loadFailed}</AlertDescription>
        </Alert>
      )}
      {isEmpty ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SparklesIcon />
            </EmptyMedia>
            <EmptyTitle>{t.skills.emptyTitle}</EmptyTitle>
            <EmptyDescription>{t.skills.emptyText}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <SkillsFigures stats={stats.data} />
          <Tabs
            value={search.view === 'overview' ? 'overview' : 'catalog'}
            onValueChange={(view) => {
              setSearch({ ...search, view: view === 'overview' ? view : undefined })
            }}
          >
            <TabsList variant="line">
              <TabsTrigger value="catalog">{t.skills.tabs.catalog}</TabsTrigger>
              <TabsTrigger value="overview">{t.skills.tabs.overview}</TabsTrigger>
            </TabsList>
            <TabsContent value="catalog">
              <SkillsCatalog
                params={toParams({ ...search, skill: undefined, view: undefined })}
                onParamsChange={(params) => {
                  setSearch({ ...Object.fromEntries(params), skill: search.skill })
                }}
                onOpen={open}
              />
            </TabsContent>
            <TabsContent value="overview">
              <SkillsTrends stats={stats.data} onOpen={open} />
            </TabsContent>
          </Tabs>
        </>
      )}
      <SkillSheet
        slug={search.skill}
        onOpenChange={(isOpen) => {
          if (!isOpen) close()
        }}
      />
    </>
  )
}
