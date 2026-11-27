// Where the tech watch reads, managed by the admin from the Watch screen: RSS feeds and web
// searches, each with optional tags of its own, and the sites whose articles are never taken in.
// A change is only a row: the next run (or "Refresh now") reads it.
import { Link } from '@tanstack/react-router'
import { BanIcon, LibraryIcon, RssIcon, SearchIcon, TagIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAppForm } from '@/components/ui/form'
import { Label } from '@/components/ui/label'
import { Popconfirm } from '@/components/ui/popconfirm'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RelativeTime } from '@/components/ui/relative-time'
import { toast } from '@/components/ui/sonner'
import { Switch } from '@/components/ui/switch'
import { getErrorMessage, TuyauError } from '@/lib/client'
import { useT } from '@/lib/locale'
import {
  useAddWatchSource,
  useDeleteWatchSource,
  useUnblockWatchSite,
  useUpdateWatchSource,
  useWatchBlockedSites,
  useWatchSources,
  type WatchSource,
  type WatchTopics,
} from '@/lib/watch'
import { TopicBadges, TopicChips } from '@/watch/watch-topics'

/** The API's bounds on a search query (`createWatchSourceInput`). */
const QUERY_MIN = 3
const QUERY_MAX = 200

/** The admin's button that opens the sources. */
export function WatchSourcesButton() {
  const t = useT().watch.sources
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true)
        }}
      >
        <LibraryIcon /> {t.open}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t.title}</DialogTitle>
            <DialogDescription>{t.description}</DialogDescription>
          </DialogHeader>
          {open && <WatchSources />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function WatchSources() {
  const t = useT().watch.sources
  const sources = useWatchSources()
  const rows = sources.data?.data ?? []
  return (
    <div className="flex max-h-[70vh] flex-col gap-6 overflow-y-auto">
      {sources.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t.loadFailed}</AlertDescription>
        </Alert>
      )}
      {sources.isSuccess && rows.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y rounded-md border p-0">
          {rows.map((source) => (
            <SourceRow
              key={source.id}
              source={source}
              webSearchReady={sources.data?.webSearchReady ?? false}
            />
          ))}
        </ul>
      )}
      <AddSourceForm webSearchReady={sources.data?.webSearchReady ?? true} />
      <BlockedSites />
    </div>
  )
}

function sourceLabel(source: WatchSource) {
  return source.title ?? source.url ?? source.query ?? String(source.id)
}

function SearchNotReady() {
  const t = useT().watch.sources
  return (
    <Alert variant="warning">
      <AlertDescription>
        {t.searchNotReady}{' '}
        <Link to="/settings" className="underline">
          {t.openSettings}
        </Link>
      </AlertDescription>
    </Alert>
  )
}

function SourceTags({ source }: { source: WatchSource }) {
  const t = useT().watch.sources
  const update = useUpdateWatchSource()
  const [open, setOpen] = React.useState(false)
  const [picked, setPicked] = React.useState(source.topics as WatchTopics)
  const label = sourceLabel(source)
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setPicked(source.topics as WatchTopics)
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t.editTags(label)}>
          <TagIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-80 flex-col gap-3">
        <p className="m-0 text-sm font-medium text-foreground">{t.editTags(label)}</p>
        <TopicChips value={picked} onChange={setPicked} label={t.tags} />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={update.isPending}
            onClick={() => {
              update.mutate(
                { id: source.id, topics: picked },
                {
                  onSuccess: () => {
                    toast.success(t.tagsSaved)
                    setOpen(false)
                  },
                  onError: () => toast.error(t.updateFailed),
                },
              )
            }}
          >
            {t.saveTags}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SourceRow({ source, webSearchReady }: { source: WatchSource; webSearchReady: boolean }) {
  const t = useT().watch.sources
  const update = useUpdateWatchSource()
  const remove = useDeleteWatchSource()
  const label = sourceLabel(source)
  const address = source.url ?? source.query
  const rss = source.kind === 'rss'
  return (
    <li className="flex items-start gap-3 p-3">
      {rss ? (
        <RssIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : (
        <SearchIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-foreground">{label}</span>
          <Badge variant="secondary">{t.kinds[source.kind]}</Badge>
        </div>
        {address && address !== label && (
          <span className="truncate font-mono text-[12px] text-muted-foreground">{address}</span>
        )}
        <div className="flex flex-wrap gap-1">
          {source.topics.length > 0 ? (
            <TopicBadges topics={source.topics} />
          ) : (
            <span className="text-[13px] text-muted-foreground">{t.noTags}</span>
          )}
        </div>
        <p className="m-0 text-sm text-muted-foreground">
          {t.articles(source.articles)}
          {' · '}
          {source.lastRunAt ? (
            <>
              {t.lastRun} <RelativeTime date={source.lastRunAt} />
            </>
          ) : (
            t.neverRun
          )}
        </p>
        {source.lastError && <p className="m-0 text-sm text-destructive">{source.lastError}</p>}
        {!rss && !webSearchReady && <SearchNotReady />}
      </div>
      <div className="flex items-center gap-1">
        <Switch
          aria-label={t.enabled(label)}
          checked={source.enabled}
          disabled={update.isPending}
          onCheckedChange={(enabled) => {
            update.mutate(
              { id: source.id, enabled },
              { onError: () => toast.error(t.updateFailed) },
            )
          }}
        />
        <SourceTags source={source} />
        <Popconfirm
          title={t.deleteTitle(label)}
          description={t.deleteText}
          confirmLabel={t.delete}
          destructive
          onConfirm={() =>
            remove.mutateAsync(source.id).then(
              () => toast.success(t.deleted),
              () => toast.error(t.deleteFailed),
            )
          }
        >
          <Button variant="ghost" size="icon-sm" aria-label={t.deleteTitle(label)}>
            <Trash2Icon />
          </Button>
        </Popconfirm>
      </div>
    </li>
  )
}

type SourceChoice = 'url' | 'query'

function AddSourceForm({ webSearchReady }: { webSearchReady: boolean }) {
  const t = useT().watch.sources
  const add = useAddWatchSource()
  const [topics, setTopics] = React.useState<WatchTopics>([])
  const form = useAppForm({
    defaultValues: { kind: 'url' as SourceChoice, value: '' },
    validators: {
      onSubmit: z
        .object({ kind: z.enum(['url', 'query']), value: z.string() })
        .superRefine(({ kind, value }, ctx) => {
          const text = value.trim()
          if (kind === 'url' && !z.url({ protocol: /^https$/ }).safeParse(text).success) {
            ctx.addIssue({ code: 'custom', path: ['value'], message: t.urlInvalid })
          }
          if (kind === 'query' && (text.length < QUERY_MIN || text.length > QUERY_MAX)) {
            ctx.addIssue({ code: 'custom', path: ['value'], message: t.queryInvalid })
          }
        }),
    },
    onSubmit: async ({ value, formApi }) => {
      const text = value.value.trim()
      const tags = topics.length > 0 ? { topics } : {}
      try {
        await add.mutateAsync(
          value.kind === 'url' ? { url: text, ...tags } : { search: text, ...tags },
        )
        toast.success(t.added)
        formApi.reset()
        setTopics([])
      } catch (error) {
        toast.error(
          error instanceof TuyauError && error.status === 409
            ? t.exists
            : getErrorMessage(error, t.addFailed),
        )
      }
    },
  })
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <h3 className="m-0 text-sm font-medium text-foreground">{t.addTitle}</h3>
      <form.AppForm>
        <form.AppField name="kind">
          {(field) => (
            <field.SegmentedField
              label={t.kind}
              size="sm"
              options={[
                { value: 'url', label: t.choices.url },
                { value: 'query', label: t.choices.query },
              ]}
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(state) => state.values.kind}>
          {(kind) => (
            <>
              <form.AppField name="value">
                {(field) =>
                  kind === 'url' ? (
                    <field.TextField
                      label={t.url}
                      placeholder="https://example.com/feed.xml"
                      autoComplete="off"
                      inputMode="url"
                    />
                  ) : (
                    <field.TextField label={t.query} autoComplete="off" maxLength={QUERY_MAX} />
                  )
                }
              </form.AppField>
              {kind === 'query' && !webSearchReady && <SearchNotReady />}
            </>
          )}
        </form.Subscribe>
        <div className="flex flex-col gap-2">
          <Label>{t.topics}</Label>
          <TopicChips value={topics} onChange={setTopics} label={t.topics} />
        </div>
        <div className="flex justify-end">
          <form.SubmitButton>{t.add}</form.SubmitButton>
        </div>
      </form.AppForm>
    </form>
  )
}

function BlockedSites() {
  const t = useT().watch.sources
  const sites = useWatchBlockedSites()
  const unblock = useUnblockWatchSite()
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <h3 className="m-0 text-sm font-medium text-foreground">{t.blockedTitle}</h3>
        <p className="m-0 text-sm text-muted-foreground">{t.blockedHelp}</p>
      </div>
      {sites.data?.length === 0 && (
        <p className="m-0 text-sm text-muted-foreground">{t.noBlocked}</p>
      )}
      {!!sites.data?.length && (
        <ul className="m-0 flex list-none flex-col divide-y rounded-md border p-0">
          {sites.data.map((site) => (
            <li key={site.id} className="flex items-center gap-3 px-3 py-2">
              <BanIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{site.host}</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={unblock.isPending}
                onClick={() => {
                  unblock.mutate(site.id, {
                    onSuccess: () => toast.success(t.unblocked),
                    onError: () => toast.error(t.unblockFailed),
                  })
                }}
              >
                {t.unblock(site.host)}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
