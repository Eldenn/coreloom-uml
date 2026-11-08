// One skill in a side sheet (`GET /skills/:slug`): what it is, where it comes from, its audits,
// why it is or is not suggested, and its installs at each weekly search.
import { ExternalLinkIcon } from 'lucide-react'

import { TrendChart } from '@/components/dashboard'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DescriptionList } from '@/components/ui/description-list'
import { formatValue } from '@/components/ui/format'
import { RelativeTime } from '@/components/ui/relative-time'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useCoreloomI18n } from '@/lib/i18n'
import { useLocale, useT } from '@/lib/locale'
import { type SkillDetail, useSkill } from '@/lib/skills'
import { RiskBadge, StateBadge } from '@/skills/skill-labels'
import { labelOf, topicLabel } from '@/skills/skill-values'

function dateOrNone(date: string | null, none: string) {
  return date ? <RelativeTime date={date} /> : none
}

function Audits({ skill }: { skill: SkillDetail }) {
  const t = useT().skills.sheet
  const { locale } = useLocale()
  const day = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' })
  if (skill.audits.length === 0) {
    return <p className="m-0 text-sm text-muted-foreground">{t.noAudits}</p>
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {skill.audits.map((audit) => (
        <li key={audit.provider} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="min-w-16 font-medium text-foreground">{audit.provider}</span>
          <RiskBadge risk={audit.risk} />
          <span className="font-mono text-[12px] text-muted-foreground">
            {t.auditedOn(day.format(new Date(audit.analyzedAt)))}
          </span>
        </li>
      ))}
    </ul>
  )
}

function History({ skill }: { skill: SkillDetail }) {
  const t = useT().skills
  const { locale } = useLocale()
  if (skill.history.length === 0) {
    return <p className="m-0 text-sm text-muted-foreground">{t.sheet.historyEmpty}</p>
  }
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
  const data = skill.history.map((point) => ({
    installs: point.installs,
    day: day.format(new Date(point.takenAt)),
  }))
  return (
    <TrendChart
      data={data}
      xKey="day"
      type="area"
      height={160}
      series={[{ key: 'installs', label: t.charts.installs }]}
      formatValue={(value) => formatValue(value, locale, { format: 'compact' })}
      aria-label={t.charts.chartLabel(t.sheet.history)}
    />
  )
}

function Reason({ skill }: { skill: SkillDetail }) {
  const t = useT().skills.sheet
  if (skill.state === 'suggested') return null
  return (
    <Alert variant={skill.state === 'blocked' ? 'destructive' : 'warning'}>
      <AlertDescription>
        <strong className="font-medium">{t.whyNot}</strong> {skill.reason ?? t.broad}
      </AlertDescription>
    </Alert>
  )
}

function SkillFacts({ skill }: { skill: SkillDetail }) {
  const t = useT().skills
  const { formatNumber } = useCoreloomI18n()
  const kinds = useCoreloomI18n().messages.diagram.kinds
  const none = t.sheet.none
  return (
    <DescriptionList
      layout="grid"
      columns={2}
      items={[
        { term: t.sheet.source, value: skill.source ?? none },
        { term: t.sheet.origin, value: t.origins[skill.origin] },
        {
          term: t.sheet.installs,
          value: skill.installs === null ? t.list.noInstalls : formatNumber(skill.installs),
        },
        { term: t.sheet.license, value: skill.license ?? none },
        { term: t.sheet.firstSeen, value: dateOrNone(skill.firstSeenAt, none) },
        { term: t.sheet.checked, value: dateOrNone(skill.checkedAt, none) },
        {
          term: t.sheet.topics,
          wide: true,
          value: skill.topics.length
            ? skill.topics.map((topic) => topicLabel(t, topic)).join(', ')
            : none,
        },
        {
          term: t.sheet.diagramKinds,
          wide: true,
          value: skill.diagramKinds.length
            ? skill.diagramKinds.map((kind) => labelOf(kinds, kind)).join(', ')
            : none,
        },
      ]}
    />
  )
}

function SkillBody({ skill }: { skill: SkillDetail }) {
  const t = useT().skills
  const { locale } = useLocale()
  const description = (locale === 'fr' ? skill.description.fr : undefined) ?? skill.description.en
  return (
    <>
      <SheetHeader>
        <SheetTitle>{skill.name}</SheetTitle>
        <SheetDescription>{description || skill.slug}</SheetDescription>
        <div className="flex flex-wrap gap-1">
          <StateBadge state={skill.state} />
          <RiskBadge risk={skill.risk} />
          {skill.topics.map((topic) => (
            <Badge key={topic} variant="outline">
              {topicLabel(t, topic)}
            </Badge>
          ))}
        </div>
      </SheetHeader>
      <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-4">
        <Reason skill={skill} />
        <SkillFacts skill={skill} />
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-sm font-medium text-foreground">{t.sheet.audits}</h3>
          <Audits skill={skill} />
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-sm font-medium text-foreground">{t.sheet.history}</h3>
          <History skill={skill} />
        </section>
        <p className="m-0 text-[13px] text-muted-foreground">{t.sheet.thirdParty}</p>
      </div>
      <SheetFooter className="flex-row flex-wrap">
        <Button variant="outline" asChild>
          <a href={skill.url} target="_blank" rel="noreferrer noopener">
            {t.sheet.openSource}
            <ExternalLinkIcon />
          </a>
        </Button>
        {skill.registryUrl && (
          <Button variant="ghost" asChild>
            <a href={skill.registryUrl} target="_blank" rel="noreferrer noopener">
              {t.sheet.openRegistry}
              <ExternalLinkIcon />
            </a>
          </Button>
        )}
      </SheetFooter>
    </>
  )
}

function SheetState({ slug }: { slug: string }) {
  const t = useT().skills.sheet
  const skill = useSkill(slug)
  if (skill.data) return <SkillBody skill={skill.data} />
  return (
    <SheetHeader>
      <SheetTitle>{skill.isError ? t.notFound : t.loading}</SheetTitle>
      {!skill.isError && <Skeleton className="h-40" />}
    </SheetHeader>
  )
}

export function SkillSheet({
  slug,
  onOpenChange,
}: {
  slug: string | undefined
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={!!slug} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-xl">
        {slug && <SheetState slug={slug} />}
      </SheetContent>
    </Sheet>
  )
}
