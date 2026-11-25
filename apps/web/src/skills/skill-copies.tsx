// The copies of one skill's files, in its sheet, for the admin only (the API refuses everyone
// else): each copy is read file by file against the last approved copy of the same skill, then
// approved or rejected. "Sync now" reads the skill again (audits, pin, copy) without waiting for
// the weekly search; a pending copy can be scanned again.
import { ExternalLinkIcon, RefreshCwIcon, ScanSearchIcon } from 'lucide-react'
import * as React from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DiffViewer } from '@/components/ui/diff-viewer'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { Label } from '@/components/ui/label'
import { RelativeTime } from '@/components/ui/relative-time'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/lib/locale'
import { pairFiles } from '@/lib/skill-version-files'
import {
  type SkillVersion,
  useCaptureSkillCopy,
  useReviewSkillVersion,
  useScanSkillVersion,
  useSkillCopies,
  useSkillVersion,
} from '@/lib/skill-versions'
import { SkillModelReview } from '@/skills/skill-model-review'

/** The API's bounds on the reason for approving despite the scan (`SKILL_OVERRIDE_REASON`). */
const OVERRIDE_REASON_MIN = 10
const OVERRIDE_REASON_MAX = 1000

const STATUS_BADGES = { pending: 'warning', approved: 'success', rejected: 'secondary' } as const

function describe(t: ReturnType<typeof useT>['skillVersions'], version: SkillVersion) {
  const licence = version.license === 'in-folder' ? t.licenceInFolder : version.license
  return `${version.repository} · ${t.files(version.files.length)} · ${t.licence(licence)}`
}

/** `canCopy`: the skill can be synced (any skill that is not blocked). */
export function SkillCopies({ slug, canCopy }: { slug: string; canCopy: boolean }) {
  const t = useT()
  const tv = t.skillVersions
  const copies = useSkillCopies(slug)
  const capture = useCaptureSkillCopy()
  const [selected, setSelected] = React.useState<number | null>(null)
  // Read from the list, so a decision taken in the dialog shows there at once.
  const open = copies.data?.data.find((version) => version.id === selected)

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-medium text-foreground">{tv.title}</h3>
        {canCopy && (
          <Button
            variant="outline"
            size="sm"
            disabled={capture.isPending}
            onClick={() => {
              capture.mutate(slug, {
                onSuccess: () => toast.success(tv.copyQueued),
                onError: () => toast.error(tv.copyFailed),
              })
            }}
          >
            <RefreshCwIcon /> {tv.copyNow}
          </Button>
        )}
      </div>
      {copies.isError && (
        <Alert variant="destructive">
          <AlertDescription>{tv.loadFailed}</AlertDescription>
        </Alert>
      )}
      {copies.isPending && <Skeleton className="h-16" />}
      {copies.data?.data.length === 0 && (
        <p className="m-0 text-sm text-muted-foreground">{tv.empty}</p>
      )}
      {copies.data && copies.data.data.length > 0 && (
        <ItemGroup className="gap-2">
          {copies.data.data.map((version) => (
            <Item key={version.id} variant="outline" asChild>
              <button
                type="button"
                className="text-left"
                onClick={() => {
                  setSelected(version.id)
                }}
              >
                <ItemContent>
                  <ItemTitle className="flex-wrap">
                    <code className="text-xs">{version.contentSha.slice(0, 7)}</code>
                    <Badge variant={STATUS_BADGES[version.status]}>
                      {t.skills.copies[version.status]}
                    </Badge>
                    {version.files.some((file) => file.executable) && (
                      <Badge variant="warning">{tv.hasScripts}</Badge>
                    )}
                    <ScanBadge scan={version.scan} />
                  </ItemTitle>
                  <ItemDescription>
                    {describe(tv, version)} · <RelativeTime date={new Date(version.createdAt)} />
                  </ItemDescription>
                </ItemContent>
              </button>
            </Item>
          ))}
        </ItemGroup>
      )}
      <Dialog
        open={!!open}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSelected(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {open.skill.name} <code className="text-xs">{open.contentSha.slice(0, 7)}</code>
                </DialogTitle>
                <DialogDescription>{describe(tv, open)}</DialogDescription>
              </DialogHeader>
              <VersionReview id={open.id} pending={open.status === 'pending'} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}

type Scan = SkillVersion['scan']
type DoneScan = Extract<NonNullable<Scan>, { status: 'done' }>

const RECOMMENDATION_BADGES: Record<string, 'success' | 'warning'> = {
  SAFE: 'success',
  CAUTION: 'warning',
}

function ScanBadge({ scan }: { scan: Scan }) {
  const t = useT().skillVersions.scan
  if (!scan) return <Badge variant="secondary">{t.pending}</Badge>
  if (scan.status === 'failed') return <Badge variant="destructive">{t.failed}</Badge>
  const variant = RECOMMENDATION_BADGES[scan.recommendation] ?? 'destructive'
  return (
    <Badge variant={variant}>{t.recommendations[scan.recommendation] ?? scan.recommendation}</Badge>
  )
}

function ScanSummary({ scan }: { scan: Scan }) {
  const t = useT().skillVersions.scan
  return (
    <section className="flex flex-col gap-1.5 rounded-md border p-3">
      <h3 className="m-0 flex flex-wrap items-center gap-2 text-sm font-medium">
        {t.title} <ScanBadge scan={scan} />
      </h3>
      {scan?.status === 'failed' && (
        <p className="m-0 text-[13px] text-muted-foreground">
          {t.failures[scan.reason] ?? scan.reason}
        </p>
      )}
      {scan?.status === 'done' && (
        <>
          <p className="m-0 text-[13px] text-muted-foreground">
            {t.score(scan.score, scan.severity)}
            {!scan.complete && ` · ${t.incomplete}`}
          </p>
          {scan.findings.length === 0 ? (
            <p className="m-0 text-[13px] text-muted-foreground">{t.none}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
              {scan.findings.map((finding, index) => (
                <li key={`${finding.id}-${String(index)}`} className="flex flex-col">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant={finding.severity === 'LOW' ? 'secondary' : 'warning'}>
                      {finding.severity}
                    </Badge>
                    <span className="font-medium">{finding.pattern}</span>
                    {finding.file && (
                      <code className="text-muted-foreground">
                        {t.at(finding.file, finding.line)}
                      </code>
                    )}
                  </span>
                  {finding.text && (
                    <code className="text-xs break-all text-muted-foreground">{finding.text}</code>
                  )}
                </li>
              ))}
            </ul>
          )}
          {scan.moreFindings > 0 && (
            <p className="m-0 text-[13px] text-muted-foreground">{t.more(scan.moreFindings)}</p>
          )}
          {!scan.complete && <ScanGaps gaps={scan.gaps ?? []} more={scan.moreGaps ?? 0} />}
        </>
      )}
    </section>
  )
}

/** The passages SkillSpector left unchecked, which the admin reads before approving despite them. */
function ScanGaps({ gaps, more }: { gaps: NonNullable<DoneScan['gaps']>; more: number }) {
  const t = useT().skillVersions.scan
  return (
    <>
      <h4 className="m-0 mt-1 text-[13px] font-medium">{t.gapsTitle}</h4>
      {gaps.length === 0 ? (
        <p className="m-0 text-[13px] text-muted-foreground">{t.gapsUnknown}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
          {gaps.map((gap, index) => (
            <li key={`${gap.reason}-${String(index)}`} className="flex flex-col">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{gap.reason}</span>
                {gap.file && (
                  <code className="text-muted-foreground">
                    {t.lines(gap.file, gap.startLine, gap.endLine)}
                  </code>
                )}
              </span>
              {gap.message && <span className="text-xs text-muted-foreground">{gap.message}</span>}
            </li>
          ))}
        </ul>
      )}
      {more > 0 && <p className="m-0 text-[13px] text-muted-foreground">{t.more(more)}</p>}
    </>
  )
}

/** Asks for a scan of a pending copy (a decided one is not scanned again); the verdict arrives with the live updates. */
function ScanButton({ id, pending, scanned }: { id: number; pending: boolean; scanned: boolean }) {
  const t = useT().skillVersions
  const scan = useScanSkillVersion()
  if (!pending) return null
  return (
    <Button
      variant="outline"
      size="sm"
      className="self-start"
      disabled={scan.isPending}
      onClick={() => {
        scan.mutate(id, {
          onSuccess: () => toast.success(t.scanQueued),
          onError: () => toast.error(t.scanFailed),
        })
      }}
    >
      <ScanSearchIcon /> {scanned ? t.scanAgain : t.scanNow}
    </Button>
  )
}

/**
 * Approving a copy despite its scan: a dialog that says what was not checked and what approving
 * does, and takes the admin's reason, kept with the copy.
 */
function ApproveAnyway({
  version,
  disabled,
  onConfirm,
}: {
  version: SkillVersion
  disabled: boolean
  onConfirm: (reason: string) => void
}) {
  const t = useT().skillVersions
  const [reason, setReason] = React.useState('')
  if (!version.approvalProblem) return null
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" disabled={disabled}>
          {t.approveDespiteScan}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.confirmTitle(version.skill.name)}</AlertDialogTitle>
          <AlertDialogDescription>
            {t.approvalProblems[version.approvalProblem]} {t.confirmBody}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`override-${String(version.id)}`}>{t.overrideLabel}</Label>
          <Textarea
            id={`override-${String(version.id)}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={OVERRIDE_REASON_MAX}
            placeholder={t.overridePlaceholder}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.confirmCancel}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={reason.trim().length < OVERRIDE_REASON_MIN}
            onClick={() => onConfirm(reason.trim())}
          >
            {t.confirmAction}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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

  const decide = (status: 'approved' | 'rejected', overrideReason?: string) =>
    review.mutate(
      { id, status, overrideReason },
      {
        onSuccess: () => toast.success(status === 'approved' ? t.approved : t.rejected),
        onError: () => toast.error(t.reviewFailed),
      },
    )

  return (
    <section className="flex min-w-0 flex-col gap-4">
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
      <ScanSummary scan={version.scan} />
      <ScanButton id={id} pending={pending} scanned={version.scan !== null} />
      <SkillModelReview version={version} />
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
      {pending && version.approvalProblem && (
        <p className="m-0 text-sm text-muted-foreground">
          {t.approvalProblems[version.approvalProblem]}
        </p>
      )}
      {version.overrideReason && (
        <p className="m-0 text-sm">
          {t.overriddenBecause} {version.overrideReason}
        </p>
      )}
      {pending && (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => decide('approved')}
            disabled={review.isPending || version.approvalProblem !== null}
          >
            {t.approve}
          </Button>
          <ApproveAnyway
            version={version}
            disabled={review.isPending}
            onConfirm={(reason) => decide('approved', reason)}
          />
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
