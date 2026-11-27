// Query hooks for the tech watch (the pattern of src/lib/query.ts): the articles everyone reads,
// and the admin's sources, blocked sites and edits.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { client } from '@/lib/client'
import { jobLaunched } from '@/lib/queue-jobs'

export type WatchArticlesQuery = NonNullable<
  Parameters<typeof client.api.watch.articles.index>[0]
>['query']
export type WatchArticle = Awaited<
  ReturnType<typeof client.api.watch.articles.index>
>['data'][number]
export type WatchSources = Awaited<ReturnType<typeof client.api.admin.watch.sources.index>>
export type WatchSource = WatchSources['data'][number]
export type WatchBlockedSite = Awaited<
  ReturnType<typeof client.api.admin.watch.blockedSites.index>
>['data'][number]

type ArticleUpdate = Parameters<typeof client.api.admin.watch.articles.update>[0]['body']
type SourceCreate = Parameters<typeof client.api.admin.watch.sources.store>[0]['body']
type SourceUpdate = Parameters<typeof client.api.admin.watch.sources.update>[0]['body']
/** The tags an article or a source may carry (the catalog's topics). */
export type WatchTopics = NonNullable<NonNullable<ArticleUpdate>['topics']>

export const watchKeys = {
  all: ['watch'] as const,
  articles: ['watch', 'articles'] as const,
  list: (query: WatchArticlesQuery) => ['watch', 'articles', query] as const,
  sources: ['watch', 'sources'] as const,
  blockedSites: ['watch', 'blocked-sites'] as const,
}

export function useWatchArticles(query: WatchArticlesQuery) {
  return useQuery({
    queryKey: watchKeys.list(query),
    queryFn: () => client.api.watch.articles.index({ query }),
    placeholderData: keepPreviousData,
  })
}

/** The admin's: hide an article or show it again, set its tags or give them back (`null`). */
export function useUpdateWatchArticle() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & NonNullable<ArticleUpdate>) =>
      client.api.admin.watch.articles.update({ params: { id }, body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: watchKeys.articles }),
  })
}

/** The admin's: the run's feeds and searches, and whether searches can be read yet. */
export function useWatchSources() {
  return useQuery({
    queryKey: watchKeys.sources,
    queryFn: () => client.api.admin.watch.sources.index({}),
  })
}

/** After a change to the sources: they, and the articles their counts and tags come from. */
function useWatchChanged() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: watchKeys.all })
}

/** The admin's: a feed address or a web search query (409 when it is there already). */
export function useAddWatchSource() {
  const changed = useWatchChanged()
  return useMutation({
    mutationFn: (body: NonNullable<SourceCreate>) => client.api.admin.watch.sources.store({ body }),
    onSuccess: changed,
  })
}

export function useUpdateWatchSource() {
  const changed = useWatchChanged()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & NonNullable<SourceUpdate>) =>
      client.api.admin.watch.sources.update({ params: { id }, body }),
    onSuccess: changed,
  })
}

/** The admin's: forgets a source; the articles it brought stay. */
export function useDeleteWatchSource() {
  const changed = useWatchChanged()
  return useMutation({
    mutationFn: (id: number) => client.api.admin.watch.sources.destroy({ params: { id } }),
    onSuccess: changed,
  })
}

/** The admin's: reads every enabled source now (409 while a run is already queued). */
export function useRefreshWatch() {
  return useMutation({
    mutationFn: () => client.api.admin.watch.refresh({}),
    onSuccess: jobLaunched,
  })
}

export function useWatchBlockedSites() {
  return useQuery({
    queryKey: watchKeys.blockedSites,
    queryFn: async () => (await client.api.admin.watch.blockedSites.index({})).data,
  })
}

/** The admin's: never takes a site in again, and hides what it brought (409 when blocked already). */
export function useBlockWatchSite() {
  const changed = useWatchChanged()
  return useMutation({
    mutationFn: (host: string) => client.api.admin.watch.blockedSites.store({ body: { host } }),
    onSuccess: changed,
  })
}

export function useUnblockWatchSite() {
  const changed = useWatchChanged()
  return useMutation({
    mutationFn: (id: number) => client.api.admin.watch.blockedSites.destroy({ params: { id } }),
    onSuccess: changed,
  })
}
