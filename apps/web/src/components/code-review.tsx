'use client'

// Coreloom UI — CodeReview. A pull request's changes to review: the changed files in a tree, each
// file's diff (unified or side by side) with a comment button on every line, the comment threads
// under their lines (reply, resolve), "Viewed" per file, and "Finish review" with a verdict and a
// summary. Front-end only: you pass the files and threads and keep them up to date from the
// callbacks.
//
//   <CodeReview files={files} threads={threads} currentUser={me}
//     onComment={(c) => addThread(c)} onReply={(id, body) => reply(id, body)}
//     onResolve={(id, resolved) => setResolved(id, resolved)}
//     onSubmitReview={(review) => api.submit(review)} />
import { FolderTreeIcon } from 'lucide-react'
import * as React from 'react'

import { LineCounts, type ReviewDiscussion, ReviewFileView } from '@/components/code-review-file'
import {
  type ReviewFile,
  type ReviewLayout,
  reviewStats,
  type ReviewSubmission,
  type ReviewThread,
} from '@/components/code-review-model'
import { FinishReview } from '@/components/code-review-submit'
import { ReviewFileTree } from '@/components/code-review-tree'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** A value the parent may own (`value` set) or leave to the block (`defaultValue`). */
function useControlled<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (value: T) => void,
): [T, (value: T) => void] {
  const [inner, setInner] = React.useState(defaultValue)
  const current = value ?? inner
  const set = (next: T) => {
    if (value === undefined) setInner(next)
    onChange?.(next)
  }
  return [current, set]
}

/** Under this width two columns of code are unreadable: the diffs are shown unified. */
const SPLIT_MIN_WIDTH = 640

/** True while the element is narrower than `below` pixels. */
function useNarrow(ref: React.RefObject<HTMLElement | null>, below: number) {
  const [narrow, setNarrow] = React.useState(false)
  // A layout effect: the first observation arrives before the paint, so a phone never shows the
  // wide layout first.
  React.useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setNarrow(entry.contentRect.width < below)
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [ref, below])
  return narrow
}

type CodeReviewProps = ReviewDiscussion & {
  files: ReviewFile[]
  /** Comment threads on the files' lines. Default none. */
  threads?: ReviewThread[]
  /** Paths marked as viewed (controlled). A viewed file starts folded. */
  viewed?: string[]
  defaultViewed?: string[]
  onViewedChange?: (viewed: string[]) => void
  /**
   * Unified (one column) or split (before and after side by side). A review narrower than 640 px
   * shows unified diffs and hides the choice.
   */
  layout?: ReviewLayout
  /** Default `unified`. */
  defaultLayout?: ReviewLayout
  onLayoutChange?: (layout: ReviewLayout) => void
  /** Sends the review. While the promise is pending the button spins; a rejection is shown. */
  onSubmitReview?: (review: ReviewSubmission) => void | Promise<void>
  /** Long lines wrap instead of scrolling sideways. */
  wrap?: boolean
  /**
   * Takes the height of its parent (a dialog, a pane) instead of growing with the files: the
   * header stays, and the tree and the files scroll on their own.
   */
  fill?: boolean
  /**
   * The app's own marks for a file, such as a warning or a count, shown in its header and in the
   * tree. Keep them short: the tree is 240 px wide.
   */
  renderFileMeta?: (file: ReviewFile) => React.ReactNode
  className?: string
  'aria-label'?: string
}

/**
 * Moves to a file after the render that opens it: scrolls to it and puts focus on its header.
 * Call it from an event that also changes state, so a render follows.
 */
function useGoToFile(fileIds: Map<string, string>) {
  const target = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!target.current) return
    const button = document.getElementById(fileIds.get(target.current) ?? '')
    target.current = null
    button?.closest('section')?.scrollIntoView({ block: 'start' })
    button?.focus({ preventScroll: true })
  })
  return (path: string) => {
    target.current = path
  }
}

/** The bar above the files: the tree's toggle on a narrow review, the totals, the layout and "Finish review". */
function ReviewHeader({
  treeId,
  treeOpen,
  onTreeOpenChange,
  stats,
  viewedCount,
  layout,
  onLayoutChange,
  onSubmitReview,
}: {
  treeId: string
  treeOpen: boolean
  onTreeOpenChange: (open: boolean) => void
  stats: ReturnType<typeof reviewStats>
  viewedCount: number
  /** Null hides the choice (a narrow review shows unified diffs). */
  layout: ReviewLayout | null
  onLayoutChange: (layout: ReviewLayout) => void
  onSubmitReview: CodeReviewProps['onSubmitReview']
}) {
  const t = useCoreloomI18n().messages.codeReview
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={treeOpen}
        aria-controls={treeId}
        className="@3xl:hidden"
        onClick={() => {
          onTreeOpenChange(!treeOpen)
        }}
      >
        <FolderTreeIcon aria-hidden />
        {t.files}
      </Button>
      <p className="m-0 flex flex-wrap items-center gap-x-2 text-[13px] text-foreground">
        {t.filesChanged(stats.files)}
        <LineCounts added={stats.added} removed={stats.removed} />
      </p>
      <p className="m-0 text-[13px] text-muted-foreground">
        {t.viewedCount(viewedCount, stats.files)}
      </p>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {layout === null ? null : (
          <SegmentedControl
            size="sm"
            aria-label={t.layout}
            value={layout}
            onValueChange={(value) => {
              onLayoutChange(value === 'split' ? 'split' : 'unified')
            }}
            options={[
              { value: 'unified', label: t.unified },
              { value: 'split', label: t.split },
            ]}
          />
        )}
        {onSubmitReview ? <FinishReview onSubmit={onSubmitReview} /> : null}
      </div>
    </div>
  )
}

function CodeReview({
  files,
  threads = [],
  viewed: viewedProp,
  defaultViewed = [],
  onViewedChange,
  layout: layoutProp,
  defaultLayout = 'unified',
  onLayoutChange,
  onSubmitReview,
  wrap,
  fill = false,
  renderFileMeta,
  className,
  'aria-label': ariaLabel,
  ...discussion
}: CodeReviewProps) {
  const t = useCoreloomI18n().messages.codeReview
  const id = React.useId()
  const [viewedList, setViewedList] = useControlled(viewedProp, defaultViewed, onViewedChange)
  const viewed = React.useMemo(() => new Set(viewedList), [viewedList])
  const [layout, setLayout] = useControlled(layoutProp, defaultLayout, onLayoutChange)
  const root = React.useRef<HTMLElement>(null)
  const narrow = useNarrow(root, SPLIT_MIN_WIDTH)
  // Files the person opened or closed by hand; the others are open unless viewed.
  const [openState, setOpenState] = React.useState<Readonly<Record<string, boolean>>>({})
  const [active, setActive] = React.useState<string | null>(files.at(0)?.path ?? null)
  const [treeOpen, setTreeOpen] = React.useState(false)
  const stats = React.useMemo(() => reviewStats(files), [files])
  const fileIds = React.useMemo(
    () => new Map(files.map((f, i) => [f.path, `${id}-file-${String(i)}`])),
    [files, id],
  )
  const goTo = useGoToFile(fileIds)

  const setOpen = (path: string, open: boolean) => {
    setOpenState((prev) => ({ ...prev, [path]: open }))
  }
  const setViewed = (path: string, on: boolean) => {
    // Marking a file viewed folds it; unmarking opens it again.
    setOpenState((prev) => ({ ...prev, [path]: !on }))
    setViewedList(on ? [...viewedList, path] : viewedList.filter((p) => p !== path))
  }
  const openFile = (path: string) => {
    setActive(path)
    setOpen(path, true)
    setTreeOpen(false)
    goTo(path)
  }

  return (
    <section
      ref={root}
      aria-label={ariaLabel ?? t.label}
      data-slot="code-review"
      data-fill={fill ? '' : undefined}
      className={cn(
        // `fill`: the classes below that start with group-data-fill read data-fill on this root.
        'group/review @container min-w-0 rounded-lg border border-border bg-background data-fill:flex data-fill:h-full data-fill:min-h-0 data-fill:flex-col',
        className,
      )}
    >
      <ReviewHeader
        treeId={`${id}-tree`}
        treeOpen={treeOpen}
        onTreeOpenChange={setTreeOpen}
        stats={stats}
        viewedCount={files.filter((f) => viewed.has(f.path)).length}
        layout={narrow ? null : layout}
        onLayoutChange={setLayout}
        onSubmitReview={onSubmitReview}
      />
      <div
        className={cn(
          'grid min-w-0 grid-cols-1 @3xl:grid-cols-[240px_minmax(0,1fr)]',
          // One scroll for both on a narrow review (the tree folds above the files), one each beside.
          'group-data-fill/review:min-h-0 group-data-fill/review:flex-1 group-data-fill/review:overflow-y-auto @3xl:group-data-fill/review:grid-rows-[minmax(0,1fr)] @3xl:group-data-fill/review:overflow-hidden',
        )}
      >
        <div
          id={`${id}-tree`}
          className={cn(
            'min-w-0 border-b border-border p-2 @3xl:block @3xl:border-r @3xl:border-b-0',
            '@3xl:group-data-fill/review:overflow-y-auto',
            !treeOpen && 'hidden',
          )}
        >
          <p
            id={`${id}-files`}
            className="m-0 px-2 pt-1 pb-2 font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
          >
            {t.files}
          </p>
          <ReviewFileTree
            files={files}
            threads={threads}
            viewed={viewed}
            active={active}
            labelledBy={`${id}-files`}
            onSelectFile={setActive}
            onOpenFile={openFile}
            renderFileMeta={renderFileMeta}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-3 p-3 *:shrink-0 @3xl:group-data-fill/review:overflow-y-auto">
          {files.length === 0 ? (
            <p className="m-0 p-4 text-[13.5px] text-muted-foreground">{t.noChanges}</p>
          ) : null}
          {files.map((file) => (
            <ReviewFileView
              key={file.path}
              file={file}
              threads={threads}
              layout={narrow ? 'unified' : layout}
              wrap={wrap}
              viewed={viewed.has(file.path)}
              onViewedChange={(on) => {
                setViewed(file.path, on)
              }}
              open={openState[file.path] ?? !viewed.has(file.path)}
              onOpenChange={(open) => {
                setOpen(file.path, open)
              }}
              toggleId={fileIds.get(file.path) ?? ''}
              discussion={discussion}
              meta={renderFileMeta?.(file)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

export { CodeReview, type CodeReviewProps }
export {
  diffStats,
  fileStats,
  lineAnchor,
  type ReviewCommentInput,
  type ReviewFile,
  type ReviewFileStatus,
  type ReviewLayout,
  type ReviewSide,
  reviewStats,
  type ReviewSubmission,
  type ReviewThread,
  reviewTree,
  type ReviewTreeNode,
  type ReviewVerdict,
} from '@/components/code-review-model'
