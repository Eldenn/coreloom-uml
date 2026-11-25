'use client'

// Coreloom UI — Code review, one file. The file's header (status, path, lines added and removed,
// "Viewed"), its diff with a comment button on each line, and the comment threads under their
// lines. Part of the CodeReview block.
import { ChevronRightIcon, MessageSquarePlusIcon } from 'lucide-react'
import * as React from 'react'

import {
  diffStats,
  lineAnchor,
  outdatedThreads,
  type ReviewCommentInput,
  type ReviewFile,
  type ReviewFileStatus,
  type ReviewLayout,
  type ReviewSide,
  type ReviewThread,
  threadsByAnchor,
  threadsForLine,
} from '@/components/code-review-model'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { type CommentAuthor, CommentComposer, CommentThread } from '@/components/ui/comment-thread'
import { type DiffLine, diffLines, DiffViewer } from '@/components/ui/diff-viewer'
import type { MentionOption } from '@/components/ui/mention-textarea'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** What a file and its threads share with the block: who writes, and what happens on a write. */
interface ReviewDiscussion {
  currentUser?: CommentAuthor
  mentionables?: MentionOption[]
  now?: Date | number
  onComment?: (comment: ReviewCommentInput) => void
  onReply?: (threadId: string, body: string) => void
  onResolve?: (threadId: string, resolved: boolean) => void
}

const STATUS_TONE: Record<ReviewFileStatus, string> = {
  added: 'text-success',
  modified: 'text-warning',
  deleted: 'text-destructive',
  renamed: 'text-primary-text',
}

/** The status as a letter for the eye (A, M, D, R) and as a word for screen readers. */
function StatusMark({ status, className }: { status: ReviewFileStatus; className?: string }) {
  const t = useCoreloomI18n().messages.codeReview
  return (
    <span
      title={t.status[status]}
      className={cn(
        'inline-flex size-[18px] shrink-0 items-center justify-center rounded-sm border border-current font-mono text-[10.5px] leading-none font-semibold',
        STATUS_TONE[status],
        className,
      )}
    >
      <span aria-hidden>{t.statusLetter[status]}</span>
      <span className="sr-only">{t.status[status]}</span>
    </span>
  )
}

/** "+12 −3", with the words for screen readers. */
function LineCounts({ added, removed }: { added: number; removed: number }) {
  const t = useCoreloomI18n().messages.display.diff
  return (
    <span className="inline-flex gap-2 font-mono text-[12px] tabular-nums">
      <span className="text-success">
        <span aria-hidden>+{added}</span>
        <span className="sr-only">{t.linesAdded(added)}</span>
      </span>
      <span className="text-destructive">
        <span aria-hidden>−{removed}</span>
        <span className="sr-only">{t.linesRemoved(removed)}</span>
      </span>
    </span>
  )
}

function ThreadView({
  thread,
  label,
  discussion,
}: {
  thread: ReviewThread
  label: string
  discussion: ReviewDiscussion
}) {
  const t = useCoreloomI18n().messages.codeReview
  const { onReply, onResolve } = discussion
  const [shown, setShown] = React.useState(false)
  const open = !thread.resolved || shown
  return (
    <div
      role="group"
      aria-label={label}
      data-slot="code-review-thread"
      data-resolved={thread.resolved ? '' : undefined}
      className="rounded-md border border-border bg-card"
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
        <span className="mr-auto flex min-w-0 flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
          {thread.resolved ? <Badge variant="success">{t.resolved}</Badge> : null}
          {thread.resolved ? (
            <button
              type="button"
              aria-expanded={open}
              className="cursor-pointer rounded-sm font-medium text-primary-text outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring"
              onClick={() => {
                setShown((value) => !value)
              }}
            >
              {t.showConversation}
            </button>
          ) : null}
          <span>{t.comments(thread.comments.length)}</span>
        </span>
        {onResolve ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onResolve(thread.id, !thread.resolved)
            }}
          >
            {thread.resolved ? t.unresolve : t.resolve}
          </Button>
        ) : null}
      </div>
      {open ? (
        <CommentThread
          className="border-t border-border-subtle p-3"
          comments={thread.comments}
          currentUser={discussion.currentUser}
          mentionables={discussion.mentionables}
          now={discussion.now}
          collapseRepliesAfter={Infinity}
          onSubmit={
            onReply
              ? (text) => {
                  onReply(thread.id, text)
                }
              : undefined
          }
        />
      ) : null}
    </div>
  )
}

const keyOf = (side: ReviewSide, line: number) => `${side}:${String(line)}`

/** A line's new-comment draft: which line, and on which side. */
interface Draft {
  side: ReviewSide
  line: number
}

/** The comment button and drafts of one file's diff, and focus back on the button afterwards. */
function useLineComments({
  path,
  onComment,
  container,
}: {
  path: string
  onComment: ReviewDiscussion['onComment']
  /** Holds the diff: the line's button is looked up in it. */
  container: React.RefObject<HTMLDivElement | null>
}): {
  draftKey: string | null
  open: (draft: Draft) => void
  close: () => void
  submit: (body: string) => void
} {
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const refocus = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!refocus.current) return
    // The draft's box is gone: focus goes back to the line's comment button.
    container.current?.querySelector<HTMLElement>(`[data-anchor="${refocus.current}"]`)?.focus()
    refocus.current = null
  })
  const close = () => {
    if (draft) refocus.current = keyOf(draft.side, draft.line)
    setDraft(null)
  }
  return {
    draftKey: draft ? keyOf(draft.side, draft.line) : null,
    open: setDraft,
    close,
    submit: (body) => {
      if (draft) onComment?.({ path, line: draft.line, side: draft.side, body })
      close()
    },
  }
}

interface ReviewFileViewProps {
  file: ReviewFile
  threads: readonly ReviewThread[]
  layout: ReviewLayout
  wrap?: boolean
  viewed: boolean
  onViewedChange: (viewed: boolean) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The id of the button that opens and closes the file: the tree moves focus to it. */
  toggleId: string
  discussion: ReviewDiscussion
  /** The app's own marks for the file (`renderFileMeta`), after its line counts. */
  meta?: React.ReactNode
}

function ReviewFileView({
  file,
  threads,
  layout,
  wrap,
  viewed,
  onViewedChange,
  open,
  onOpenChange,
  toggleId,
  discussion,
  meta,
}: ReviewFileViewProps) {
  const t = useCoreloomI18n().messages.codeReview
  const lines = React.useMemo(() => diffLines(file.before, file.after), [file.before, file.after])
  const stats = diffStats(lines)
  const byAnchor = React.useMemo(() => threadsByAnchor(threads, file.path), [threads, file.path])
  const outdated = outdatedThreads(byAnchor, lines)
  const count = [...byAnchor.values()].reduce((n, list) => n + list.length, 0)
  const container = React.useRef<HTMLDivElement>(null)
  const comments = useLineComments({ path: file.path, onComment: discussion.onComment, container })
  const { draftKey } = comments

  const renderLineAction = (line: DiffLine) => {
    const anchor = lineAnchor(line)
    const key = keyOf(anchor.side, anchor.line)
    return (
      <button
        type="button"
        data-anchor={key}
        aria-label={t.commentOnLine(anchor.line, anchor.side === 'old')}
        title={t.commentOnLine(anchor.line, anchor.side === 'old')}
        className={cn(
          'inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-primary-text opacity-0 outline-none hover:bg-primary-subtle focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring pointer-coarse:opacity-100 [&_svg]:size-3.5 [tr:hover_&]:opacity-100',
          draftKey === key && 'opacity-100',
        )}
        onClick={() => {
          comments.open(anchor)
        }}
      >
        <MessageSquarePlusIcon aria-hidden />
      </button>
    )
  }

  const renderAfterLine = (line: DiffLine) => {
    const anchor = lineAnchor(line)
    const list = threadsForLine(byAnchor, line)
    const drafting = draftKey === keyOf(anchor.side, anchor.line)
    if (!list.length && !drafting) return null
    return (
      <div className="flex flex-col gap-3 bg-background p-3">
        {list.map((thread) => (
          <ThreadView
            key={thread.id}
            thread={thread}
            label={t.threadLabel(file.path, thread.line)}
            discussion={discussion}
          />
        ))}
        {drafting ? (
          <CommentComposer
            autoFocus
            author={discussion.currentUser}
            mentionables={discussion.mentionables}
            aria-label={t.newComment(anchor.line)}
            submitLabel={t.addComment}
            onSubmit={comments.submit}
            onCancel={comments.close}
          />
        ) : null}
      </div>
    )
  }

  return (
    <section
      aria-labelledby={toggleId}
      data-slot="code-review-file"
      data-path={file.path}
      className="scroll-mt-3 overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
        <button
          id={toggleId}
          type="button"
          aria-expanded={open}
          className="flex min-w-0 flex-1 basis-60 cursor-pointer items-center gap-2 rounded-sm text-left font-mono text-[12.5px] text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
          onClick={() => {
            onOpenChange(!open)
          }}
        >
          <ChevronRightIcon
            aria-hidden
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform duration-fast',
              open && 'rotate-90',
            )}
          />
          <StatusMark status={file.status} />
          <span className="min-w-0 [overflow-wrap:anywhere]">{file.path}</span>
        </button>
        <LineCounts added={stats.added} removed={stats.removed} />
        {meta}
        {count ? (
          <span className="text-[12.5px] text-muted-foreground">{t.comments(count)}</span>
        ) : null}
        <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-fg-secondary">
          <Checkbox
            checked={viewed}
            aria-label={t.markViewed(file.path)}
            onCheckedChange={(checked) => {
              onViewedChange(checked === true)
            }}
          />
          {t.viewed}
        </label>
        {file.oldPath ? (
          <p className="m-0 w-full font-mono text-[12px] [overflow-wrap:anywhere] text-muted-foreground">
            {t.renamedFrom(file.oldPath)}
          </p>
        ) : null}
      </div>
      {open ? (
        <div ref={container} className="border-t border-border-subtle">
          <DiffViewer
            before={file.before}
            after={file.after}
            view={layout}
            wrap={wrap}
            showHeader={false}
            emptyText={t.noChanges}
            renderLineAction={discussion.onComment ? renderLineAction : undefined}
            renderAfterLine={renderAfterLine}
          />
          {outdated.length ? (
            <div className="flex flex-col gap-3 border-t border-border-subtle bg-background p-3">
              <p className="m-0 text-[12.5px] font-medium text-muted-foreground">{t.outdated}</p>
              {outdated.map((thread) => (
                <ThreadView
                  key={thread.id}
                  thread={thread}
                  label={t.threadLabel(file.path, thread.line)}
                  discussion={discussion}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

export { LineCounts, type ReviewDiscussion, ReviewFileView, StatusMark }
