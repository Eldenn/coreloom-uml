// The catalog of ready-made rules, inside a configuration (`?step=rules`, with `pack=<id>` for one
// pack and `group=<slot>` to land on one group). Rules are ticked in place: each change saves its
// group at once (`RuleGroupBlock`), there is no draft and nothing to submit.
import { useMutationState } from '@tanstack/react-query'
import { ArrowLeftIcon, SearchXIcon } from 'lucide-react'
import * as React from 'react'

import { useLocalized } from '@/agent-configs/catalog'
import { RuleGroupBlock } from '@/agent-configs/rule-group-block'
import { AppliedBadge } from '@/agent-configs/rule-text'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { SearchInput } from '@/components/ui/input-group'
import { SaveStatus } from '@/components/ui/save-status'
import { Toggle } from '@/components/ui/toggle'
import {
  type AgentConfig,
  agentConfigKeys,
  type RuleGroup,
  type RulePack,
} from '@/lib/agent-configs'
import { useLocale, useT } from '@/lib/locale'
import {
  type Choice,
  groupDomId,
  groupSearchText,
  heldBySlot,
  isApplied,
  matchesTerms,
  searchTerms,
} from '@/lib/ready-rules'
import { cn } from '@/lib/utils'

export interface LibraryView {
  pack?: string
  group?: string
}

const ALL = 'all'
/** Groups rendered at first, and added each time the end of the list comes near. */
const PAGE = 30
const NONE: readonly Choice[] = []

interface Entry {
  pack: RulePack
  group: RuleGroup
  /** What the search reads, already folded. */
  text: string
  applied: boolean
}

/** The search and the two filters, and the groups that pass them in every pack. */
function useLibraryFilter(packs: RulePack[], held: Map<string, Choice[]>) {
  const { locale } = useLocale()
  const [query, setQuery] = React.useState('')
  // Typing stays fluid: the list follows a moment later.
  const deferredQuery = React.useDeferredValue(query)
  const terms = React.useMemo(() => searchTerms(deferredQuery), [deferredQuery])
  const [onlyApplied, setOnlyApplied] = React.useState(false)
  // The groups held when "Held" was turned on: one emptied since then stays in view.
  const [heldThen, setHeldThen] = React.useState<ReadonlySet<string> | null>(null)

  const entries = React.useMemo<Entry[]>(
    () =>
      packs.flatMap((pack) =>
        pack.groups.map((group) => ({
          pack,
          group,
          text: groupSearchText(pack, group, locale),
          applied: isApplied(group),
        })),
      ),
    [packs, locale],
  )
  const matching = React.useMemo(
    () =>
      entries.filter(
        (entry) =>
          (!onlyApplied || entry.applied) &&
          (!heldThen || heldThen.has(entry.group.slot) || held.has(entry.group.slot)) &&
          matchesTerms(entry.text, terms),
      ),
    [entries, held, heldThen, onlyApplied, terms],
  )

  return {
    entries,
    matching,
    query,
    setQuery,
    terms,
    onlyApplied,
    setOnlyApplied,
    onlyHeld: heldThen !== null,
    setOnlyHeld: (on: boolean) => {
      setHeldThen(on ? new Set(held.keys()) : null)
    },
  }
}

type LibraryFilter = ReturnType<typeof useLibraryFilter>

export function AgentConfigLibrary({
  configId,
  config,
  packs,
  view,
  onViewChange,
  onBack,
}: {
  configId: number
  config: AgentConfig
  packs: RulePack[]
  view: LibraryView
  onViewChange: (view: LibraryView) => void
  onBack: () => void
}) {
  const t = useT()
  const localized = useLocalized()
  const held = React.useMemo(() => heldBySlot(config.readyRules), [config.readyRules])
  const filter = useLibraryFilter(packs, held)
  const headingRef = React.useRef<HTMLHeadingElement>(null)
  const focusHeading = React.useRef(false)

  const linked = view.group
    ? filter.entries.find((entry) => entry.group.slot === view.group)
    : undefined
  const scopePack = packs.find((pack) => pack.id === view.pack) ?? linked?.pack
  const scope = scopePack?.id ?? ALL
  const shown = scopePack
    ? filter.matching.filter((entry) => entry.pack === scopePack)
    : filter.matching

  React.useEffect(() => {
    if (!focusHeading.current) return
    focusHeading.current = false
    headingRef.current?.scrollIntoView({ block: 'start' })
    headingRef.current?.focus({ preventScroll: true })
  }, [scope])

  const goTo = (pack: string) => {
    focusHeading.current = pack !== scope
    onViewChange(pack === ALL ? {} : { pack })
  }

  return (
    <div className="flex flex-col gap-5">
      <LibraryBar
        configId={configId}
        heldCount={config.readyRules.length}
        filter={filter}
        // A search or a filter looks in every pack: it leaves the open one.
        onWiden={() => {
          if (scope !== ALL) onViewChange({})
        }}
        onBack={onBack}
      />
      <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
        <span>{t.agents.ready.intro}</span>
        <AppliedBadge />
        <span>{t.agents.ready.appliedHint}</span>
      </p>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
        <PackNav
          scope={scope}
          items={[
            { id: ALL, label: t.agents.ready.all, held: config.readyRules.length, empty: false },
            ...packs.map((pack) => ({
              id: pack.id,
              label: localized(pack.title),
              held: pack.groups.reduce(
                (sum, group) => sum + (held.get(group.slot)?.length ?? 0),
                0,
              ),
              empty: !filter.matching.some((entry) => entry.pack === pack),
            })),
          ]}
          onSelect={goTo}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h3
              ref={headingRef}
              tabIndex={-1}
              className="m-0 scroll-mt-48 rounded-sm font-display text-[20px] font-semibold tracking-[-0.015em] text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
            >
              {scopePack ? localized(scopePack.title) : t.agents.ready.all}
            </h3>
            {scopePack && (
              <p className="m-0 text-[14px] text-muted-foreground">
                {localized(scopePack.description)}
              </p>
            )}
            <p role="status" className="m-0 text-[13px] text-muted-foreground">
              {t.agents.ready.results(shown.length)}
            </p>
          </div>
          {shown.length === 0 ? (
            <NoMatch
              filter={filter}
              onSearchAll={
                scope !== ALL && filter.matching.length > 0
                  ? () => {
                      goTo(ALL)
                    }
                  : undefined
              }
            />
          ) : (
            <Results
              // A new list for a new question: it starts again from its first groups.
              key={`${scope}|${filter.terms.join(' ')}|${String(filter.onlyApplied)}|${String(filter.onlyHeld)}`}
              configId={configId}
              entries={shown}
              byPack={scope === ALL}
              held={held}
              terms={filter.terms}
              linkedSlot={linked?.group.slot}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/** Always in sight: the way back, how many rules are held, whether they are saved, the search. */
function LibraryBar({
  configId,
  heldCount,
  filter,
  onWiden,
  onBack,
}: {
  configId: number
  heldCount: number
  filter: LibraryFilter
  onWiden: () => void
  onBack: () => void
}) {
  const t = useT()
  return (
    <div className="sticky top-14 z-(--z-sticky) -mx-1 flex flex-col gap-3 border-b border-border-subtle bg-background/90 px-1 py-3 backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
          <ArrowLeftIcon /> {t.agents.backToSummary}
        </Button>
        <h2 className="m-0 font-display text-[18px] font-semibold tracking-[-0.015em] text-foreground">
          {t.agents.ready.title}
        </h2>
        <p className="m-0 text-[13px] text-muted-foreground">{t.agents.ready.count(heldCount)}</p>
        <SavingStatus configId={configId} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          className="min-w-0 flex-1 basis-56"
          aria-label={t.agents.ready.search}
          placeholder={t.agents.ready.search}
          value={filter.query}
          onValueChange={(next) => {
            if (next.trim() && !filter.query.trim()) onWiden()
            filter.setQuery(next)
          }}
        />
        <div role="group" aria-label={t.agents.ready.filters} className="flex items-center gap-2">
          <Toggle
            variant="outline"
            pressed={filter.onlyApplied}
            onPressedChange={(pressed) => {
              if (pressed) onWiden()
              filter.setOnlyApplied(pressed)
            }}
          >
            {t.agents.ready.filterApplied}
          </Toggle>
          <Toggle
            variant="outline"
            pressed={filter.onlyHeld}
            onPressedChange={(pressed) => {
              if (pressed) onWiden()
              filter.setOnlyHeld(pressed)
            }}
          >
            {t.agents.ready.filterHeld}
          </Toggle>
        </div>
      </div>
    </div>
  )
}

interface PackNavItem {
  id: string
  label: string
  /** Ready-made rules held in it. */
  held: number
  /** Nothing in it passes the search and the filters. */
  empty: boolean
}

/** The packs, and "All": a row that scrolls sideways on a phone, a column beside the rules on a desk. */
function PackNav({
  scope,
  items,
  onSelect,
}: {
  scope: string
  items: PackNavItem[]
  onSelect: (id: string) => void
}) {
  const t = useT()
  return (
    <nav
      aria-label={t.agents.ready.packs}
      // Positioned, so the visually hidden texts inside scroll with it.
      className="relative -mx-1 shrink-0 overflow-x-auto lg:sticky lg:top-48 lg:mx-0 lg:w-64 lg:overflow-visible"
    >
      <ul className="m-0 flex list-none gap-1 p-1 lg:flex-col lg:p-0">
        {items.map((item) => {
          const current = item.id === scope
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-current={current ? 'true' : undefined}
                className={cn(
                  'flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-[14px] whitespace-nowrap transition-colors duration-fast outline-none focus-visible:ring-[3px] focus-visible:ring-ring lg:whitespace-normal',
                  current
                    ? 'bg-primary-subtle font-medium text-primary-text'
                    : 'text-fg-secondary hover:bg-accent hover:text-foreground',
                  item.empty && !current && 'text-muted-foreground',
                )}
                onClick={() => {
                  onSelect(item.id)
                }}
              >
                <span className="min-w-0">
                  {item.label}
                  {item.empty && <span className="sr-only"> ({t.agents.ready.packNoMatch})</span>}
                </span>
                {item.held > 0 && (
                  <Badge variant={current ? 'default' : 'secondary'} className="shrink-0">
                    <span aria-hidden>{item.held}</span>
                    <span className="sr-only">{t.agents.ready.packHeld(item.held)}</span>
                  </Badge>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Whether the ready-made rules are saved, from every save started since this view opened. */
function SavingStatus({ configId }: { configId: number }) {
  const [since] = React.useState(() => Date.now())
  const saves = useMutationState({
    filters: { mutationKey: agentConfigKeys.readyRules(configId) },
    select: (mutation) => mutation.state,
  }).filter((state) => state.submittedAt >= since)
  const state = () => {
    if (saves.some((save) => save.status === 'pending')) return 'saving'
    return saves.at(-1)?.status === 'error' ? 'error' : 'saved'
  }
  return <SaveStatus className="ml-auto" state={state()} />
}

function NoMatch({
  filter,
  onSearchAll,
}: {
  filter: LibraryFilter
  /** Given when other packs have matches. */
  onSearchAll: (() => void) | undefined
}) {
  const t = useT()
  const query = filter.query.trim()
  return (
    <Empty className="border border-dashed border-border py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{t.agents.ready.noMatchTitle}</EmptyTitle>
        <EmptyDescription>
          {query ? t.agents.ready.noMatchSearch(query) : t.agents.ready.noMatchFilters}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row flex-wrap justify-center gap-2">
        {onSearchAll && (
          <Button variant="secondary" size="sm" onClick={onSearchAll}>
            {t.agents.ready.searchAll}
          </Button>
        )}
        {query && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              filter.setQuery('')
            }}
          >
            {t.agents.ready.clearSearch}
          </Button>
        )}
        {(filter.onlyApplied || filter.onlyHeld) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              filter.setOnlyApplied(false)
              filter.setOnlyHeld(false)
            }}
          >
            {t.agents.ready.clearFilters}
          </Button>
        )}
      </EmptyContent>
    </Empty>
  )
}

/** The groups to show, a page at a time: more are added as the end of the list comes near. */
function Results({
  configId,
  entries,
  byPack,
  held,
  terms,
  linkedSlot,
}: {
  configId: number
  entries: Entry[]
  /** Several packs are listed: each gets its heading. */
  byPack: boolean
  held: Map<string, Choice[]>
  terms: readonly string[]
  /** The group the address names: rendered whatever its place, scrolled to and focused. */
  linkedSlot: string | undefined
}) {
  const t = useT()
  const localized = useLocalized()
  const linkedIndex = entries.findIndex((entry) => entry.group.slot === linkedSlot)
  const [limit, setLimit] = React.useState(Math.max(PAGE, linkedIndex + 1))
  const moreRef = React.useRef<HTMLButtonElement>(null)
  const more = limit < entries.length

  // A new observer after each page: it reports again if the end is still in sight.
  React.useEffect(() => {
    const button = moreRef.current
    if (!button) return
    const observer = new IntersectionObserver(
      (hits) => {
        if (hits.some((hit) => hit.isIntersecting)) setLimit((current) => current + PAGE)
      },
      { rootMargin: '800px' },
    )
    observer.observe(button)
    return () => {
      observer.disconnect()
    }
  }, [limit, more])

  React.useEffect(() => {
    if (!linkedSlot) return
    const block = document.getElementById(groupDomId(linkedSlot))
    if (!block) return
    block.scrollIntoView({ block: 'center' })
    block.focus({ preventScroll: true })
  }, [linkedSlot])

  const SectionHeading = byPack ? 'h5' : 'h4'
  return (
    <div className="flex flex-col gap-3">
      {entries.slice(0, limit).map((entry, index) => {
        const previous = index > 0 ? entries.at(index - 1) : undefined
        const newPack = byPack && entry.pack !== previous?.pack
        const newSection = newPack || entry.group.section !== previous?.group.section
        return (
          <React.Fragment key={entry.group.slot}>
            {newPack && (
              <h4 className="m-0 mt-4 font-display text-[17px] font-semibold text-foreground first:mt-0">
                {localized(entry.pack.title)}
              </h4>
            )}
            {newSection && (
              <SectionHeading className="m-0 mt-2 font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase first:mt-0">
                {entry.group.section}
              </SectionHeading>
            )}
            <RuleGroupBlock
              configId={configId}
              group={entry.group}
              held={held.get(entry.group.slot) ?? NONE}
              terms={terms}
              linked={entry.group.slot === linkedSlot}
            />
          </React.Fragment>
        )
      })}
      {more && (
        <Button
          ref={moreRef}
          variant="outline"
          className="self-center"
          onClick={() => {
            setLimit(limit + PAGE)
          }}
        >
          {t.agents.ready.more}
        </Button>
      )}
    </div>
  )
}
