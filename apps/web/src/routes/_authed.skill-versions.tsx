// The admin's review of the skills' copies: each copy is read file by file against the last
// approved copy of the same skill, then approved or rejected. Only the default account
// (`user.isAdmin`) gets here; the API refuses everyone else anyway.
import { createFileRoute, redirect } from '@tanstack/react-router'
import { ExternalLinkIcon } from 'lucide-react'
import * as React from 'react'

import { meQueryOptions } from '@/auth/auth-context'
import { PageHeader } from '@/components/app-shell'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DiffViewer } from '@/components/ui/diff-viewer'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { RelativeTime } from '@/components/ui/relative-time'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { useT } from '@/lib/locale'
import { pairFiles } from '@/lib/skill-version-files'
import {
  type SkillVersion,
  type SkillVersionStatus,
  useReviewSkillVersion,
  useSkillVersion,
  useSkillVersions,
} from '@/lib/skill-versions'

export const Route = createFileRoute('/_authed/skill-versions')({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.query({ ...meQueryOptions, staleTime: 'static' })
    if (!user?.isAdmin) throw redirect({ to: '/projects', replace: true })
  },
  staticData: { crumb: (t) => t.nav.skillVersions },
  component: SkillVersionsPage,
})

const STATUSES: SkillVersionStatus[] = ['pending', 'approved', 'rejected']

function SkillVersionsPage() {
  const t = useT().skillVersions
  const [status, setStatus] = React.useState<SkillVersionStatus>('pending')
  const [selected, setSelected] = React.useState<number | null>(null)
  const list = useSkillVersions(status, 1)

  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <SegmentedControl
        aria-label={t.title}
        options={STATUSES.map((value) => ({ value, label: t.statuses[value] }))}
        value={status}
        onValueChange={(value) => {
          setStatus(value as SkillVersionStatus)
          setSelected(null)
        }}
        className="self-start"
      />
      {list.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t.loadFailed}</AlertDescription>
        </Alert>
      )}
      {list.isPending && <Skeleton className="h-24" />}
      {list.data?.data.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t.empty}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
      {list.data && list.data.data.length > 0 && (
        <ItemGroup>
          {list.data.data.map((version) => (
            <VersionRow
              key={version.id}
              version={version}
              open={selected === version.id}
              onToggle={() => setSelected(selected === version.id ? null : version.id)}
            />
          ))}
        </ItemGroup>
      )}
    </>
  )
}

function VersionRow({
  version,
  open,
  onToggle,
}: {
  version: SkillVersion
  open: boolean
  onToggle: () => void
}) {
  const t = useT().skillVersions
  const scripts = version.files.some((file) => file.executable)
  return (
    <div className="flex flex-col gap-3">
      <Item variant="outline" asChild>
        <button type="button" aria-expanded={open} onClick={onToggle} className="text-left">
          <ItemContent>
            <ItemTitle>
              {version.skill.name}
              <code className="text-xs text-muted-foreground">
                {version.contentSha.slice(0, 7)}
              </code>
              {scripts && <Badge variant="warning">{t.hasScripts}</Badge>}
            </ItemTitle>
            <ItemDescription>
              {version.repository} · {t.files(version.files.length)} ·{' '}
              {t.licence(version.license === 'in-folder' ? t.licenceInFolder : version.license)} ·{' '}
              <RelativeTime date={new Date(version.createdAt)} />
            </ItemDescription>
          </ItemContent>
        </button>
      </Item>
      {open && <VersionReview id={version.id} pending={version.status === 'pending'} />}
    </div>
  )
}

function VersionReview({ id, pending }: { id: number; pending: boolean }) {
  const t = useT().skillVersions
  const detail = useSkillVersion(id)
  const review = useReviewSkillVersion()
  if (detail.isPending) return <Skeleton className="h-40" />
  if (!detail.data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t.loadFailed}</AlertDescription>
      </Alert>
    )
  }
  const { version, files, previous } = detail.data
  const pairs = pairFiles(files, previous?.files)
  const changed = pairs.filter((pair) => pair.status !== null)
  const unchanged = pairs.filter((pair) => pair.status === null).map((pair) => pair.path)

  const decide = (status: 'approved' | 'rejected') =>
    review.mutate(
      { id, status },
      {
        onSuccess: () => toast.success(status === 'approved' ? t.approved : t.rejected),
        onError: () => toast.error(t.reviewFailed),
      },
    )

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-sm text-muted-foreground">
          {previous ? t.againstPrevious(previous.version.commit.slice(0, 7)) : t.firstCopy}
        </p>
        <Button variant="link" size="sm" asChild>
          <a href={version.url} target="_blank" rel="noreferrer noopener">
            <ExternalLinkIcon /> {t.source}
          </a>
        </Button>
      </div>
      {changed.map((pair) => (
        <section key={pair.path} className="flex flex-col gap-1.5">
          <h3 className="m-0 flex flex-wrap items-center gap-2 text-sm font-medium">
            <code>{pair.path}</code>
            {pair.status && <Badge variant="secondary">{t.fileStatuses[pair.status]}</Badge>}
            {pair.executable && <Badge variant="warning">{t.executable}</Badge>}
          </h3>
          <DiffViewer
            before={pair.before}
            after={pair.after}
            beforeLabel={previous?.version.commit.slice(0, 7)}
            afterLabel={version.commit.slice(0, 7)}
            wrap
            className="max-h-96 overflow-auto"
          />
        </section>
      ))}
      {unchanged.length > 0 && (
        <p className="m-0 text-[13px] text-muted-foreground">{t.unchanged(unchanged.join(', '))}</p>
      )}
      {pending && (
        <div className="flex gap-2">
          <Button onClick={() => decide('approved')} disabled={review.isPending}>
            {t.approve}
          </Button>
          <Button
            variant="secondary"
            onClick={() => decide('rejected')}
            disabled={review.isPending}
          >
            {t.reject}
          </Button>
        </div>
      )}
    </section>
  )
}
