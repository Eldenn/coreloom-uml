import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusCircleIcon,
  SearchIcon,
  SearchXIcon,
  XIcon,
} from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface FacetOption {
  value: string
  label: string
  icon?: React.ReactNode
}
interface Facet<T> {
  /** URL parameter and row field (or `get` for computed values). */
  key: string
  label: string
  options: FacetOption[]
  get?: (row: T) => string
}

interface DataListState {
  q: string
  page: number
  facets: Record<string, string[]>
}

function readParams(params: URLSearchParams, facetKeys: string[]): DataListState {
  const facets: Record<string, string[]> = {}
  for (const k of facetKeys) facets[k] = params.get(k)?.split(',').filter(Boolean) ?? []
  return { q: params.get('q') ?? '', page: Math.max(1, Number(params.get('page')) || 1), facets }
}

function writeParams(base: URLSearchParams, state: DataListState, facetKeys: string[]) {
  const params = new URLSearchParams(base)
  if (state.q) params.set('q', state.q)
  else params.delete('q')
  if (state.page > 1) params.set('page', String(state.page))
  else params.delete('page')
  for (const k of facetKeys) {
    const selected = state.facets[k] as string[] | undefined
    if (selected?.length) params.set(k, selected.join(','))
    else params.delete(k)
  }
  return params
}

/** Filtering, facet counts and pagination for `rows`, with the state kept in the URL. */
function useDataList<T extends object>({
  rows,
  searchKeys,
  facets = [],
  pageSize = 10,
  searchParams,
  onSearchParamsChange,
}: {
  rows: T[]
  /** Fields the search box matches (case- and accent-insensitive). */
  searchKeys: (keyof T & string)[]
  facets?: Facet<T>[]
  pageSize?: number
  /** Router-owned params; leave out to use window.location. */
  searchParams?: URLSearchParams
  onSearchParamsChange?: (params: URLSearchParams) => void
}) {
  const facetKeys = facets.map((f) => f.key)
  const controlled = searchParams !== undefined
  const [local, setLocal] = React.useState<URLSearchParams>(() =>
    typeof window === 'undefined'
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search),
  )
  const params = controlled ? searchParams : local

  React.useEffect(() => {
    if (controlled) return
    const onPop = () => {
      setLocal(new URLSearchParams(window.location.search))
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
    }
  }, [controlled])

  const state = readParams(params, facetKeys)

  const setState = (patch: Partial<DataListState>) => {
    // Any filter change goes back to page 1, unless the patch sets the page itself.
    const next = { ...state, ...patch, page: patch.page ?? 1 }
    const out = writeParams(params, next, facetKeys)
    if (onSearchParamsChange) onSearchParamsChange(out)
    if (!controlled) {
      setLocal(out)
      const qs = out.toString()
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`,
      )
    }
  }

  const norm = (v: unknown) =>
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- row values are primitives; String() is the intended conversion
    String(v ?? '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
  const valueOf = (row: T, f: Facet<T>) =>
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- row values are primitives; String() is the intended conversion
    f.get ? f.get(row) : String((row as Record<string, unknown>)[f.key] ?? '')
  const q = norm(state.q.trim())
  const matchesSearch = (row: T) => !q || searchKeys.some((k) => norm(row[k]).includes(q))
  const matchesFacets = (row: T, except?: string) =>
    facets.every(
      (f) =>
        f.key === except ||
        !(state.facets[f.key] as string[] | undefined)?.length ||
        state.facets[f.key].includes(valueOf(row, f)),
    )

  const filtered = rows.filter((r) => matchesSearch(r) && matchesFacets(r))
  // Counts per option ignore the facet's own selection, so options stay comparable.
  const counts: Record<string, Record<string, number>> = {}
  for (const f of facets) {
    counts[f.key] = {}
    for (const r of rows)
      if (matchesSearch(r) && matchesFacets(r, f.key))
        counts[f.key][valueOf(r, f)] = (counts[f.key][valueOf(r, f)] ?? 0) + 1
  }
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const page = Math.min(state.page, pageCount)
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)
  const isFiltered = !!state.q || Object.values(state.facets).some((v) => v.length > 0)

  return {
    state,
    setSearch: (value: string) => {
      setState({ q: value })
    },
    setFacet: (key: string, values: string[]) => {
      setState({ facets: { ...state.facets, [key]: values } })
    },
    setPage: (p: number) => {
      setState({ page: p })
    },
    clear: () => {
      setState({ q: '', facets: Object.fromEntries(facetKeys.map((k) => [k, []])) })
    },
    facets,
    counts,
    filtered,
    pageRows,
    page,
    pageCount,
    total: rows.length,
    isFiltered,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lets parts take a list of any row type; `object` would reject typed rows through the callbacks.
type DataList<T extends object = any> = ReturnType<typeof useDataList<T>>

/** A facet's button: opens a searchable checklist with counts; shows what's picked. */
function FacetedFilter({
  title,
  options,
  value,
  onValueChange,
  counts,
}: {
  title: string
  options: FacetOption[]
  value: string[]
  onValueChange: (values: string[]) => void
  counts?: Record<string, number>
}) {
  const { messages, formatNumber } = useCoreloomI18n()
  const t = messages.dataList
  const selected = new Set(value)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-dashed"
          aria-label={t.filterBy(title)}
        >
          <PlusCircleIcon />
          {title}
          {selected.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-0.5 h-4" />
              {selected.size > 2 ? (
                <Badge variant="secondary">{t.selected(selected.size)}</Badge>
              ) : (
                options
                  .filter((o) => selected.has(o.value))
                  .map((o) => (
                    <Badge key={o.value} variant="secondary">
                      {o.label}
                    </Badge>
                  ))
              )}
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>{messages.common.noResults}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const on = selected.has(o.value)
                return (
                  <CommandItem
                    key={o.value}
                    value={o.label}
                    role="option"
                    aria-selected={on}
                    onSelect={() => {
                      onValueChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])
                    }}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-4 items-center justify-center rounded-xs border border-border-strong [&_svg]:size-3',
                        on && 'border-primary bg-primary text-primary-foreground',
                      )}
                    >
                      {on && <CheckIcon />}
                    </span>
                    {o.icon}
                    <span className="flex-1">{o.label}</span>
                    {counts && (
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {formatNumber(counts[o.value] ?? 0)}
                      </span>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
          {selected.size > 0 && (
            <div className="border-t border-border-subtle p-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  onValueChange([])
                }}
              >
                {t.clear}
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Search box, one FacetedFilter per facet, "Clear filters" and the result count. */
function DataListToolbar({
  list,
  searchLabel,
  actions,
  className,
}: {
  list: DataList
  /** Accessible name and placeholder of the search box (default: "Search…"). */
  searchLabel?: string
  /** At the right: a sort Select, a "New" button. */
  actions?: React.ReactNode
  className?: string
}) {
  const { messages, formatNumber } = useCoreloomI18n()
  const t = messages.dataList
  const [draft, setDraft] = React.useState(list.state.q)
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs the draft from the list's query (back/forward, reset)
    setDraft(list.state.q)
  }, [list.state.q])
  // Search as you type, a beat after the last key.
  React.useEffect(() => {
    if (draft === list.state.q) return
    const id = setTimeout(() => {
      list.setSearch(draft)
    }, 250)
    return () => {
      clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searches when the draft changes, not when the list object is rebuilt.
  }, [draft])
  return (
    <div data-slot="data-list-toolbar" className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
            }}
            placeholder={searchLabel ?? t.search}
            aria-label={searchLabel ?? t.search}
            className="h-9 pl-9"
          />
        </div>
        {list.facets.map((f) => (
          <FacetedFilter
            key={f.key}
            title={f.label}
            options={f.options}
            value={list.state.facets[f.key] ?? []}
            onValueChange={(v) => {
              list.setFacet(f.key, v)
            }}
            counts={list.counts[f.key]}
          />
        ))}
        {list.isFiltered && (
          <Button variant="ghost" size="sm" onClick={list.clear}>
            {t.clear}
            <XIcon />
          </Button>
        )}
        {!!actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
      <p role="status" className="m-0 font-mono text-[12px] text-muted-foreground">
        {t.results(formatNumber(list.filtered.length), list.filtered.length)}
      </p>
    </div>
  )
}

/** Shown instead of the rows when the filters match nothing. */
function DataListEmpty({ list, className }: { list: DataList; className?: string }) {
  const t = useCoreloomI18n().messages.dataList
  return (
    <Empty className={cn('border', className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon />
        </EmptyMedia>
        <EmptyTitle>{t.empty}</EmptyTitle>
        <EmptyDescription>{t.emptyHint}</EmptyDescription>
      </EmptyHeader>
      {list.isFiltered && (
        <Button variant="secondary" size="sm" onClick={list.clear}>
          {t.clear}
        </Button>
      )}
    </Empty>
  )
}

/** "Page 2 of 5" with previous / next. */
function DataListPagination({ list, className }: { list: DataList; className?: string }) {
  const { messages, formatNumber } = useCoreloomI18n()
  if (list.pageCount <= 1) return null
  return (
    <nav
      aria-label={messages.pagination.label}
      className={cn('flex items-center justify-end gap-3', className)}
    >
      <span className="font-mono text-[12px] text-muted-foreground">
        {messages.dataTable.pageOf(formatNumber(list.page), formatNumber(list.pageCount))}
      </span>
      <div className="flex gap-1.5">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={messages.pagination.previousPage}
          disabled={list.page <= 1}
          onClick={() => {
            list.setPage(list.page - 1)
          }}
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={messages.pagination.nextPage}
          disabled={list.page >= list.pageCount}
          onClick={() => {
            list.setPage(list.page + 1)
          }}
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </nav>
  )
}

export {
  type DataList,
  DataListEmpty,
  DataListPagination,
  DataListToolbar,
  type Facet,
  FacetedFilter,
  type FacetOption,
  useDataList,
}
