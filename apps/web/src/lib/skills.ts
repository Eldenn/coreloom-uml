// Query hooks for the skills catalog (the pattern of src/lib/query.ts), and the live stream that
// tells the screen when the weekly search changed it.
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'

import { apiBaseUrl, client } from '@/lib/client'

export type SkillsList = Awaited<ReturnType<typeof client.api.skills.index>>
export type SkillSummary = SkillsList['data'][number]
export type SkillDetail = Awaited<ReturnType<typeof client.api.skills.show>>['skill']
export type SkillsStats = Awaited<ReturnType<typeof client.api.skills.stats>>
export type SkillState = SkillSummary['state']
export type SkillRisk = SkillSummary['risk']

/** The list's filters, sort and page, as the API reads them. */
export type SkillsQuery = NonNullable<Parameters<typeof client.api.skills.index>[0]>['query']
export type SkillsSort = NonNullable<NonNullable<SkillsQuery>['sort']>

export const skillKeys = {
  all: ['skills'] as const,
  list: (query: SkillsQuery) => ['skills', 'list', query] as const,
  detail: (slug: string) => ['skills', 'detail', slug] as const,
  stats: ['skills', 'stats'] as const,
}

export function useSkills(query: SkillsQuery) {
  return useQuery({
    queryKey: skillKeys.list(query),
    queryFn: () => client.api.skills.index({ query }),
    // Keeps the current page on screen while the next filter's page loads.
    placeholderData: keepPreviousData,
  })
}

export function useSkill(slug: string | undefined) {
  return useQuery({
    queryKey: skillKeys.detail(slug ?? ''),
    queryFn: async () => (await client.api.skills.show({ params: { slug: slug ?? '' } })).skill,
    enabled: !!slug,
  })
}

export function useSkillsStats() {
  return useQuery({ queryKey: skillKeys.stats, queryFn: () => client.api.skills.stats({}) })
}

export type LiveStatus = 'connecting' | 'live' | 'offline'

/** Events `GET /skills/events` sends when the catalog changes. */
const CATALOG_EVENTS = ['catalog.refreshed', 'catalog.updated'] as const

/**
 * Keeps the Skills screen current: listens to `GET /skills/events` (Server-Sent Events, which the
 * typed client cannot open) and reloads every skills query when the catalog changes. The browser
 * reconnects by itself after a drop. `onChange` runs once per change.
 */
export function useSkillsLiveUpdates(onChange?: () => void) {
  const queryClient = useQueryClient()
  const [status, setStatus] = React.useState<LiveStatus>('connecting')
  const changed = React.useRef(onChange)
  React.useEffect(() => {
    changed.current = onChange
  }, [onChange])

  React.useEffect(() => {
    const source = new EventSource(`${apiBaseUrl}/skills/events`, { withCredentials: true })
    const onOpen = () => {
      setStatus('live')
    }
    const onError = () => {
      setStatus(source.readyState === EventSource.CLOSED ? 'offline' : 'connecting')
    }
    const onCatalog = () => {
      void queryClient.invalidateQueries({ queryKey: skillKeys.all })
      changed.current?.()
    }
    source.addEventListener('open', onOpen)
    source.addEventListener('error', onError)
    for (const type of CATALOG_EVENTS) source.addEventListener(type, onCatalog)
    return () => {
      source.removeEventListener('open', onOpen)
      source.removeEventListener('error', onError)
      for (const type of CATALOG_EVENTS) source.removeEventListener(type, onCatalog)
      source.close()
    }
  }, [queryClient])

  return status
}
