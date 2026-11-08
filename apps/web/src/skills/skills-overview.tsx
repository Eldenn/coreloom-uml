// The top of the Skills screen: the catalog in figures and its history, one point per weekly
// search (`GET /skills/stats`).
import { TrendingUpIcon } from 'lucide-react'

import { ChartCard, StatGrid, TrendChart } from '@/components/dashboard'
import { BarList } from '@/components/ui/bar-list'
import { DonutChart } from '@/components/ui/donut-chart'
import { formatValue } from '@/components/ui/format'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { useCoreloomI18n } from '@/lib/i18n'
import { useT } from '@/lib/locale'
import type { SkillsStats } from '@/lib/skills'
import { topicLabel } from '@/skills/skill-values'

/** `+12` or `−3` against the run before, when there is one. */
function deltaOf(values: number[], locale: string) {
  if (values.length < 2) return undefined
  const delta = values[values.length - 1] - values[values.length - 2]
  return formatValue(delta, locale, { format: 'compact', signDisplay: 'exceptZero' })
}

function StatsGrid({ stats }: { stats: SkillsStats }) {
  const t = useT().skills
  const { locale, formatNumber } = useCoreloomI18n()
  const { totals, runs } = stats
  const skills = runs.map((run) => run.skills)
  const eligible = runs.map((run) => run.eligible)
  const installs = runs.map((run) => run.installs)
  const added = runs.map((run) => run.newSkills)
  return (
    <StatGrid
      stats={[
        {
          label: t.stats.skills,
          value: formatNumber(totals.skills),
          delta: deltaOf(skills, locale),
          note: t.stats.perRun,
          sparkline: skills,
        },
        {
          label: t.stats.suggested,
          value: formatNumber(totals.suggested),
          delta: deltaOf(eligible, locale),
          note: t.stats.suggestedNote(formatNumber(totals.blocked)),
          sparkline: eligible,
        },
        {
          label: t.stats.installs,
          value: formatValue(totals.installs, locale, { format: 'compact' }),
          delta: deltaOf(installs, locale),
          note: t.stats.perRun,
          sparkline: installs,
        },
        {
          label: t.stats.newSkills,
          value: formatNumber(added.at(-1) ?? 0),
          note: t.stats.perRun,
          sparkline: added,
        },
      ]}
    />
  )
}

function HistoryCharts({ stats }: { stats: SkillsStats }) {
  const t = useT().skills.charts
  const { locale } = useCoreloomI18n()
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
  const data = stats.runs.map((run) => ({ ...run, day: day.format(new Date(run.takenAt)) }))
  if (data.length === 0) {
    return <p className="m-0 text-sm text-muted-foreground">{t.noHistory}</p>
  }
  const compact = (value: number) => formatValue(value, locale, { format: 'compact' })
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard className="min-w-0" title={t.installsTitle} description={t.installsDescription}>
        <TrendChart
          data={data}
          xKey="day"
          type="area"
          height={220}
          series={[{ key: 'installs', label: t.installs }]}
          formatValue={compact}
          aria-label={t.chartLabel(t.installsTitle)}
        />
      </ChartCard>
      <ChartCard className="min-w-0" title={t.growthTitle} description={t.growthDescription}>
        <TrendChart
          data={data}
          xKey="day"
          type="bar"
          height={220}
          series={[
            { key: 'skills', label: t.returned },
            { key: 'newSkills', label: t.added, type: 'line' },
          ]}
          aria-label={t.chartLabel(t.growthTitle)}
        />
      </ChartCard>
    </div>
  )
}

function Trending({ stats, onOpen }: { stats: SkillsStats; onOpen: (slug: string) => void }) {
  const t = useT().skills
  const { locale } = useCoreloomI18n()
  if (stats.trending.length === 0) {
    return <p className="m-0 text-sm text-muted-foreground">{t.charts.trendingEmpty}</p>
  }
  return (
    <ItemGroup className="gap-1">
      {stats.trending.map((skill) => (
        <Item key={skill.slug} size="sm" asChild>
          <button
            type="button"
            className="w-full text-left"
            onClick={() => {
              onOpen(skill.slug)
            }}
          >
            <ItemContent>
              <ItemTitle>{skill.name}</ItemTitle>
              <ItemDescription className="font-mono text-[12px]">{skill.source}</ItemDescription>
            </ItemContent>
            <ItemActions className="font-mono text-[12px] text-success">
              <TrendingUpIcon aria-hidden className="size-3.5" />
              {t.list.gained(formatValue(skill.installsDelta ?? 0, locale, { format: 'compact' }))}
            </ItemActions>
          </button>
        </Item>
      ))}
    </ItemGroup>
  )
}

function Breakdown({ stats, onOpen }: { stats: SkillsStats; onOpen: (slug: string) => void }) {
  const t = useT().skills
  const { formatNumber } = useCoreloomI18n()
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ChartCard
        className="min-w-0"
        title={t.charts.risksTitle}
        description={t.charts.risksDescription}
      >
        <DonutChart
          data={stats.risks.map((entry) => ({
            key: entry.risk,
            label: t.risks[entry.risk],
            value: entry.count,
          }))}
          centerValue={formatNumber(stats.totals.skills)}
          centerLabel={t.charts.risksCenter}
          legend="bottom"
          aria-label={t.charts.risksTitle}
        />
      </ChartCard>
      <ChartCard
        className="min-w-0"
        title={t.charts.topicsTitle}
        description={t.charts.topicsDescription}
      >
        <BarList
          data={stats.topics.map((entry) => ({
            key: entry.topic,
            label: topicLabel(t, entry.topic),
            value: entry.count,
          }))}
          limit={6}
          aria-label={t.charts.topicsTitle}
        />
      </ChartCard>
      <ChartCard
        className="min-w-0"
        title={t.charts.trendingTitle}
        description={t.charts.trendingDescription}
      >
        <Trending stats={stats} onOpen={onOpen} />
      </ChartCard>
    </div>
  )
}

export function SkillsOverview({
  stats,
  onOpen,
}: {
  stats: SkillsStats | undefined
  onOpen: (slug: string) => void
}) {
  if (!stats) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <StatsGrid stats={stats} />
      <HistoryCharts stats={stats} />
      <Breakdown stats={stats} onOpen={onOpen} />
    </div>
  )
}
