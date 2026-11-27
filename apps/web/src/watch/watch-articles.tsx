// The watch's articles, newest first, filtered and paginated by the API (`GET /watch/articles`),
// the filters and the page kept in the URL. An excerpt is a stranger's text: shown as text only.
import { NewspaperIcon } from 'lucide-react'

import {
  type DataList,
  DataListEmpty,
  DataListPagination,
  DataListToolbar,
  useDataList,
} from '@/components/data-list'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useLocale, useT } from '@/lib/locale'
import { cn } from '@/lib/utils'
import { useWatchArticles, type WatchArticle } from '@/lib/watch'
import { topicLabel } from '@/skills/skill-values'
import {
  WATCH_PAGE_SIZE,
  WATCH_PERIODS,
  watchQueryFrom,
  type WatchSearch,
} from '@/watch/watch-query'
import { TopicBadges } from '@/watch/watch-topics'

/** "Any" in the Selects, which take no empty value. */
const ANY = 'any'

export function PublishedOn({ date }: { date: string }) {
  const { locale } = useLocale()
  return (
    <time dateTime={date}>
      {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(date))}
    </time>
  )
}

function ArticleRow({
  article,
  onManage,
}: {
  article: WatchArticle
  onManage?: (article: WatchArticle) => void
}) {
  const t = useT().watch
  return (
    <Item
      variant="outline"
      className={cn('items-start sm:flex-nowrap', onManage && 'cursor-pointer hover:bg-accent/60')}
      // The admin opens the sheet from anywhere on the card but its link; the Manage button
      // does the same from the keyboard.
      onClick={(event) => {
        if (!onManage || (event.target as HTMLElement).closest('a, button')) return
        onManage(article)
      }}
    >
      <ItemContent className="min-w-0">
        <ItemTitle className="flex-wrap">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            {article.title}
            <span className="sr-only"> {t.list.newTab}</span>
          </a>
          {article.hidden && <Badge variant="secondary">{t.list.hidden}</Badge>}
        </ItemTitle>
        <span className="text-[12px] text-muted-foreground">
          <span className="font-mono">{article.site}</span> ·{' '}
          <PublishedOn date={article.publishedAt} />
          {article.source && (
            <>
              {' · '}
              {t.list.via(t.sources.kinds[article.source.kind], article.source.label)}
            </>
          )}
        </span>
        {article.excerpt && <ItemDescription>{article.excerpt}</ItemDescription>}
        {article.topics.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            <TopicBadges topics={article.topics} />
          </span>
        )}
      </ItemContent>
      {onManage && (
        <ItemActions className="shrink-0">
          <Button
            variant="ghost"
            size="sm"
            aria-label={t.list.manageLabel(article.title)}
            onClick={() => {
              onManage(article)
            }}
          >
            {t.list.manage}
          </Button>
        </ItemActions>
      )}
    </Item>
  )
}

function Filters({
  search,
  isAdmin,
  onChange,
}: {
  search: WatchSearch
  isAdmin: boolean
  onChange: (patch: WatchSearch) => void
}) {
  const t = useT()
  const f = t.watch.filters
  const flag = (key: 'untagged' | 'hidden') => (
    <div className="flex items-center gap-2">
      <Switch
        id={`watch-${key}`}
        checked={search[key] === '1'}
        onCheckedChange={(on) => {
          onChange({ [key]: on ? '1' : undefined })
        }}
      />
      <Label htmlFor={`watch-${key}`} className="text-[13px] font-normal">
        {f[key]}
      </Label>
    </div>
  )
  return (
    <>
      <Select
        value={search.topic ?? ANY}
        onValueChange={(topic) => {
          onChange({ topic: topic === ANY ? undefined : topic })
        }}
      >
        <SelectTrigger size="sm" aria-label={f.topic} className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{f.allTopics}</SelectItem>
          {Object.keys(t.skills.topics).map((topic) => (
            <SelectItem key={topic} value={topic}>
              {topicLabel(t.skills, topic)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={search.since ?? ANY}
        onValueChange={(since) => {
          onChange({ since: since === ANY ? undefined : since })
        }}
      >
        <SelectTrigger size="sm" aria-label={f.period} className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{f.anyTime}</SelectItem>
          {WATCH_PERIODS.map((days) => (
            <SelectItem key={days} value={days}>
              {f.days(days)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isAdmin && flag('untagged')}
      {isAdmin && flag('hidden')}
    </>
  )
}

function ArticleRows({
  list,
  loading,
  onManage,
}: {
  list: DataList<WatchArticle>
  loading: boolean
  onManage?: (article: WatchArticle) => void
}) {
  if (list.matched === 0) return <DataListEmpty list={list} />
  return (
    <ItemGroup
      className={cn('gap-2 transition-opacity', loading && 'opacity-60')}
      aria-busy={loading}
    >
      {list.pageRows.map((article) => (
        <ArticleRow key={article.id} article={article} onManage={onManage} />
      ))}
    </ItemGroup>
  )
}

export function WatchArticles({
  search,
  isAdmin,
  onSearchChange,
  onManage,
}: {
  search: WatchSearch
  isAdmin: boolean
  /** The next URL parameters, all of them. */
  onSearchChange: (search: WatchSearch) => void
  onManage?: (article: WatchArticle) => void
}) {
  const messages = useT()
  const t = messages.watch
  const articles = useWatchArticles(watchQueryFrom(search, messages.skills.topics, isAdmin))
  // The list owns the words and the page; the other filters ride along in the same parameters.
  const params = new URLSearchParams(
    Object.entries(search).filter((entry): entry is [string, string] => !!entry[1]),
  )
  const list = useDataList({
    rows: articles.data?.data ?? [],
    searchKeys: [],
    pageSize: WATCH_PAGE_SIZE,
    searchParams: params,
    onSearchParamsChange: (next) => {
      onSearchChange(Object.fromEntries(next))
    },
    server: { total: articles.data?.meta.total ?? 0 },
  })
  const filtered = Object.entries(search).some(([key, value]) => key !== 'page' && !!value)

  if (articles.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t.loadFailed}</AlertDescription>
      </Alert>
    )
  }
  if (articles.isSuccess && articles.data.meta.total === 0 && !filtered) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <NewspaperIcon />
          </EmptyMedia>
          <EmptyTitle>{t.emptyTitle}</EmptyTitle>
          <EmptyDescription>{isAdmin ? t.emptyAdmin : t.emptyText}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <section className="flex flex-col gap-4" aria-label={t.title}>
      <DataListToolbar
        list={list}
        searchLabel={t.filters.search}
        actions={
          <Filters
            search={search}
            isAdmin={isAdmin}
            onChange={(patch) => {
              onSearchChange({ ...search, ...patch, page: undefined })
            }}
          />
        }
      />
      {articles.isPending ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <ArticleRows list={list} loading={articles.isPlaceholderData} onManage={onManage} />
      )}
      <DataListPagination list={list} />
    </section>
  )
}
