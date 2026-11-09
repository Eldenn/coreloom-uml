// The catalog as a ranked list, the way skills.sh shows it: search, filters with counts, a sort
// and pages, all filtered by the API (`GET /skills`) and kept in the URL.
import { ArrowUpRightIcon, TrendingUpIcon } from 'lucide-react'

import {
  type DataList,
  DataListEmpty,
  DataListPagination,
  DataListToolbar,
  type Facet,
  useDataList,
} from '@/components/data-list'
import { Badge } from '@/components/ui/badge'
import { formatValue } from '@/components/ui/format'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useCoreloomI18n } from '@/lib/i18n'
import { useLocale, useT } from '@/lib/locale'
import { type SkillsSort, type SkillSummary, useSkills } from '@/lib/skills'
import { RiskBadge, StateBadge } from '@/skills/skill-labels'
import { labelOf, SKILLS_PAGE_SIZE, skillsQueryFrom, topicLabel } from '@/skills/skill-values'

/** The facets, their options being the values the API counted. */
function useFacets(counts: Record<string, Record<string, number>> | undefined) {
  const t = useT().skills
  const kinds = useCoreloomI18n().messages.diagram.kinds
  const options = (key: string, label: (value: string) => string) =>
    Object.keys(counts?.[key] ?? {}).map((value) => ({ value, label: label(value) }))
  const facets: Facet<SkillSummary>[] = [
    { key: 'topic', label: t.list.topic, options: options('topic', (v) => topicLabel(t, v)) },
    {
      key: 'diagramKind',
      label: t.list.diagramKind,
      options: options('diagramKind', (v) => labelOf(kinds, v)),
    },
    { key: 'state', label: t.list.state, options: options('state', (v) => labelOf(t.states, v)) },
    { key: 'risk', label: t.list.risk, options: options('risk', (v) => labelOf(t.risks, v)) },
  ]
  return facets
}

function SortSelect({ value, onChange }: { value: SkillsSort; onChange: (sort: string) => void }) {
  const t = useT().skills
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label={t.list.sort} className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(t.sorts) as SkillsSort[]).map((sort) => (
          <SelectItem key={sort} value={sort}>
            {t.sorts[sort]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function SkillRow({
  skill,
  rank,
  onOpen,
}: {
  skill: SkillSummary
  rank: number
  onOpen: (slug: string) => void
}) {
  const t = useT().skills
  const { locale } = useLocale()
  const { formatNumber } = useCoreloomI18n()
  const description = (locale === 'fr' ? skill.description.fr : undefined) ?? skill.description.en
  return (
    <Item variant="outline" className="flex-wrap" asChild>
      <button
        type="button"
        className="w-full text-left"
        onClick={() => {
          onOpen(skill.slug)
        }}
      >
        <ItemMedia className="w-10 justify-end font-mono text-[12px] text-muted-foreground">
          {t.list.rank(formatNumber(rank))}
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle className="flex-wrap">
            {skill.name}
            {skill.state !== 'suggested' && <StateBadge state={skill.state} />}
          </ItemTitle>
          {skill.source && (
            <span className="font-mono text-[12px] text-muted-foreground">{skill.source}</span>
          )}
          {description && <ItemDescription>{description}</ItemDescription>}
          <span className="mt-1 flex flex-wrap gap-1">
            <RiskBadge risk={skill.risk} />
            {skill.topics.map((topic) => (
              <Badge key={topic} variant="outline">
                {topicLabel(t, topic)}
              </Badge>
            ))}
          </span>
        </ItemContent>
        <ItemActions className="flex-col items-end gap-0.5 font-mono text-[12px] max-sm:w-full max-sm:flex-row max-sm:items-center max-sm:justify-start max-sm:gap-3 max-sm:pl-14">
          <span className="text-foreground">
            {skill.installs === null
              ? t.list.noInstalls
              : t.list.installs(formatValue(skill.installs, locale, { format: 'compact' }))}
          </span>
          {!!skill.installsDelta && skill.installsDelta > 0 && (
            <span className="flex items-center gap-1 text-success">
              <TrendingUpIcon aria-hidden className="size-3.5" />
              {t.list.gained(formatValue(skill.installsDelta, locale, { format: 'compact' }))}
            </span>
          )}
          <ArrowUpRightIcon aria-hidden className="size-4 text-muted-foreground max-sm:hidden" />
        </ItemActions>
      </button>
    </Item>
  )
}

function SkillRows({
  list,
  firstRank,
  loading,
  onOpen,
}: {
  list: DataList<SkillSummary>
  firstRank: number
  loading: boolean
  onOpen: (slug: string) => void
}) {
  if (list.matched === 0) return <DataListEmpty list={list} />
  return (
    <ItemGroup className="gap-2" aria-busy={loading}>
      {list.pageRows.map((skill, index) => (
        <SkillRow key={skill.slug} skill={skill} rank={firstRank + index} onOpen={onOpen} />
      ))}
    </ItemGroup>
  )
}

export function SkillsCatalog({
  params,
  onParamsChange,
  onOpen,
}: {
  params: URLSearchParams
  onParamsChange: (params: URLSearchParams) => void
  onOpen: (slug: string) => void
}) {
  const t = useT().skills
  const kinds = useCoreloomI18n().messages.diagram.kinds
  const query = skillsQueryFrom(params, {
    topics: t.topics,
    kinds,
    states: t.states,
    risks: t.risks,
    sorts: t.sorts,
  })
  const skills = useSkills(query)
  const facets = useFacets(skills.data?.facets)
  const list = useDataList({
    rows: skills.data?.data ?? [],
    searchKeys: [],
    facets,
    pageSize: SKILLS_PAGE_SIZE,
    searchParams: params,
    onSearchParamsChange: onParamsChange,
    server: { total: skills.data?.meta.total ?? 0, counts: skills.data?.facets },
  })
  const setSort = (sort: string) => {
    const next = new URLSearchParams(params)
    if (sort === 'installs') next.delete('sort')
    else next.set('sort', sort)
    next.delete('page')
    onParamsChange(next)
  }
  const firstRank = ((skills.data?.meta.page ?? 1) - 1) * SKILLS_PAGE_SIZE + 1

  return (
    <section className="flex flex-col gap-4" aria-label={t.title}>
      <DataListToolbar
        list={list}
        searchLabel={t.list.search}
        actions={<SortSelect value={query.sort} onChange={setSort} />}
      />
      {skills.isPending ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <SkillRows
          list={list}
          firstRank={firstRank}
          loading={skills.isPlaceholderData}
          onOpen={onOpen}
        />
      )}
      <DataListPagination list={list} />
    </section>
  )
}
