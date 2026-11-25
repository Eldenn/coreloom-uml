// The copies of one skill's files, in its sheet, for the admin only (the API refuses everyone
// else): each copy is read file by file against the last approved copy of the same skill, then
// approved or rejected. "Sync now" reads the skill again (audits, pin, copy) without waiting for
// the weekly search; a pending copy can be scanned again.
import {
  ExternalLinkIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  RefreshCwIcon,
  ScanSearchIcon,
  TerminalIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import * as React from 'react'

import { CodeReview, type ReviewFile } from '@/components/code-review'
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
        {/* Fixed height, no outer scroll: the file list and the diff scroll on their own, and the
            decision stays in view however long the files are. */}
        <DialogContent className="flex h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,100rem)]">
          {open && (
            <>
              <DialogHeader className="border-b px-[22px] py-4">
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {open.skill.name}
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal">
                    {open.contentSha.slice(0, 7)}
                  </code>
                  <Badge variant={STATUS_BADGES[open.status]}>{t.skills.copies[open.status]}</Badge>
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

/** The scan's verdict and findings, above the files: the decision below depends on it. */
function ScanSummary({ scan, action }: { scan: Scan; action: React.ReactNode }) {
  const t = useT().skillVersions.scan
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="m-0 flex items-center gap-2 text-sm font-medium text-foreground">
          {t.title} <ScanBadge scan={scan} />
        </h3>
        {scan?.status === 'failed' && (
          <span className="text-[13px] text-muted-foreground">
            {t.failures[scan.reason] ?? scan.reason}
          </span>
        )}
        {scan?.status === 'done' && (
          <span className="text-[13px] text-muted-foreground">
            {t.score(scan.score, scan.severity)}
            {!scan.complete && ` · ${t.incomplete}`}
            {scan.findings.length === 0 && ` · ${t.none}`}
          </span>
        )}
        <span className="ml-auto">{action}</span>
      </div>
      {scan?.status === 'done' && scan.findings.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
          {scan.findings.map((finding, index) => (
            <li key={`${finding.id}-${String(index)}`} className="flex flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant={finding.severity === 'LOW' ? 'secondary' : 'warning'}>
                  {finding.severity}
                </Badge>
                <span className="font-medium text-foreground">{finding.pattern}</span>
                {finding.file && (
                  <code className="text-xs text-muted-foreground">
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
      {scan?.status === 'done' && scan.moreFindings > 0 && (
        <p className="m-0 text-[13px] text-muted-foreground">{t.more(scan.moreFindings)}</p>
      )}
      <ScanGaps scan={scan} />
    </section>
  )
}

/** The passages SkillSpector left unchecked, which the admin reads before approving despite them. */
function ScanGaps({ scan }: { scan: Scan }) {
  const t = useT().skillVersions.scan
  if (scan?.status !== 'done' || scan.complete) return null
  const gaps = scan.gaps ?? []
  const more = scan.moreGaps ?? 0
  return (
    <>
      <h4 className="m-0 mt-1 text-[13px] font-medium text-foreground">{t.gapsTitle}</h4>
      {gaps.length === 0 ? (
        <p className="m-0 text-[13px] text-muted-foreground">{t.gapsUnknown}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
          {gaps.map((gap, index) => (
            <li key={`${gap.reason}-${String(index)}`} className="flex flex-col">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{gap.reason}</span>
                {gap.file && (
                  <code className="text-xs text-muted-foreground">
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
      variant="ghost"
      size="sm"
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

type VersionDetail = NonNullable<ReturnType<typeof useSkillVersion>['data']>

const REVIEW_STATUSES = { added: 'added', changed: 'modified', removed: 'deleted' } as const

/** The changed files for CodeReview, SKILL.md first: it is what an agent reads first. */
function reviewFiles(pairs: ReturnType<typeof pairFiles>): ReviewFile[] {
  const files: ReviewFile[] = []
  for (const pair of pairs) {
    if (!pair.status) continue
    const file = {
      path: pair.path,
      status: REVIEW_STATUSES[pair.status],
      before: pair.before,
      after: pair.after,
    }
    if (pair.path === 'SKILL.md') files.unshift(file)
    else files.push(file)
  }
  return files
}

/** A file's marks in the review: it is executable, and how many of the scan's findings it holds. */
function FileMarks({ executable, findings }: { executable: boolean; findings: number }) {
  const t = useT().skillVersions
  return (
    <>
      {executable && (
        <span title={t.executable} className="inline-flex text-warning">
          <TerminalIcon aria-hidden className="size-3.5" />
          <span className="sr-only">{t.executable}</span>
        </span>
      )}
      {findings > 0 && (
        <span
          title={t.findingsInFile(findings)}
          className="inline-flex items-center gap-0.5 font-mono text-[12px] text-warning"
        >
          <TriangleAlertIcon aria-hidden className="size-3.5" />
          <span aria-hidden>{findings}</span>
          <span className="sr-only">{t.findingsInFile(findings)}</span>
        </span>
      )}
    </>
  )
}

function VersionReview({ id, pending }: { id: number; pending: boolean }) {
  const t = useT().skillVersions
  const detail = useSkillVersion(id)
  // The files ticked "Viewed" in the review, so the admin sees what is still unread before deciding.
  const [viewed, setViewed] = React.useState<string[]>([])
  // The scan and the model's reading sit beside the files on a wide screen, above them otherwise;
  // the admin folds them away to give the files the whole width.
  const [analysisOpen, setAnalysisOpen] = React.useState(true)
  const pairs = React.useMemo(
    () => (detail.data ? pairFiles(detail.data.files, detail.data.previous?.files) : []),
    [detail.data],
  )
  const files = React.useMemo(() => reviewFiles(pairs), [pairs])

  if (detail.isPending) return <Skeleton className="m-[22px] h-40" />
  if (!detail.data) {
    return (
      <Alert variant="destructive" className="m-[22px] w-auto">
        <AlertDescription>{t.loadFailed}</AlertDescription>
      </Alert>
    )
  }
  const { version, previous } = detail.data
  const { scan } = version
  const executable = new Set(pairs.filter((pair) => pair.executable).map((pair) => pair.path))
  const findingsIn = (path: string) =>
    scan?.status === 'done' ? scan.findings.filter((finding) => finding.file === path).length : 0
  const unchanged = pairs.filter((pair) => pair.status === null).map((pair) => pair.path)
  const unread = files.filter((file) => !viewed.includes(file.path)).length

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        {analysisOpen ? (
          <aside
            id={`analysis-${String(id)}`}
            className="flex max-h-[35%] shrink-0 flex-col gap-3 overflow-y-auto border-b px-[22px] py-3 xl:max-h-none xl:w-[22rem] xl:border-r xl:border-b-0"
          >
            <div className="flex items-start gap-2">
              <p className="m-0 flex flex-1 flex-wrap items-center gap-x-3 text-[13px] text-muted-foreground">
                {previous ? t.againstPrevious(previous.version.commit.slice(0, 7)) : t.firstCopy}
                {unchanged.length > 0 && <span>{t.unchanged(unchanged.join(', '))}</span>}
                <a
                  href={version.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLinkIcon className="size-3.5" /> {t.source}
                </a>
              </p>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t.hideAnalysis}
                aria-expanded
                aria-controls={`analysis-${String(id)}`}
                onClick={() => {
                  setAnalysisOpen(false)
                }}
              >
                <PanelLeftCloseIcon />
              </Button>
            </div>
            <ScanSummary
              scan={scan}
              action={<ScanButton id={id} pending={pending} scanned={scan !== null} />}
            />
            <SkillModelReview version={version} />
          </aside>
        ) : (
          <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 xl:flex-col xl:border-r xl:border-b-0">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t.showAnalysis}
              aria-expanded={false}
              onClick={() => {
                setAnalysisOpen(true)
              }}
            >
              <PanelLeftOpenIcon />
            </Button>
            <ScanBadge scan={scan} />
          </div>
        )}
        <div className="min-h-0 min-w-0 flex-1 p-3">
          <CodeReview
            fill
            wrap
            files={files}
            viewed={viewed}
            onViewedChange={setViewed}
            renderFileMeta={(file) => (
              <FileMarks executable={executable.has(file.path)} findings={findingsIn(file.path)} />
            )}
            aria-label={t.filesLabel}
          />
        </div>
      </div>
      <ReviewFooter id={id} version={version} pending={pending} unread={unread} />
    </>
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

/** The decision, kept in view under the files: approve, approve despite the scan through a dialog that warns and takes a reason, or reject. */
function ReviewFooter({
  id,
  version,
  pending,
  unread,
}: {
  id: number
  version: VersionDetail['version']
  pending: boolean
  unread: number
}) {
  const t = useT().skillVersions
  const review = useReviewSkillVersion()
  if (!pending && !version.overrideReason) return null

  const decide = (status: 'approved' | 'rejected', overrideReason?: string) =>
    review.mutate(
      { id, status, overrideReason },
      {
        onSuccess: () => toast.success(status === 'approved' ? t.approved : t.rejected),
        onError: () => toast.error(t.reviewFailed),
      },
    )

  return (
    <footer className="flex flex-col gap-3 border-t px-[22px] py-4">
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          {unread > 0 && (
            <p className="m-0 mr-auto text-[13px] text-muted-foreground">{t.unread(unread)}</p>
          )}
          <Button
            variant="secondary"
            onClick={() => decide('rejected')}
            disabled={review.isPending}
          >
            {t.reject}
          </Button>
          <ApproveAnyway
            version={version}
            disabled={review.isPending}
            onConfirm={(reason) => decide('approved', reason)}
          />
          <Button
            onClick={() => decide('approved')}
            disabled={review.isPending || version.approvalProblem !== null}
          >
            {t.approve}
          </Button>
        </div>
      )}
    </footer>
  )
}
