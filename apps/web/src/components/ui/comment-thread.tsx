'use client'

// Coreloom UI — CommentThread. A discussion under a document, a task, a design or a pull request:
// comments with their author and time, one level of replies, emoji reactions, "@" mentions and a
// box to write. Front-end only: you keep the comments and pass `onSubmit` and `onReact`.
//
//   <CommentThread comments={comments} currentUser={me} mentionables={team}
//     onSubmit={(text, parentId) => add(text, parentId)}
//     onReact={(id, emoji) => toggleReaction(id, emoji)} />
import { SmilePlusIcon } from 'lucide-react'
import * as React from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { EmojiPicker } from '@/components/ui/emoji-picker'
import { type MentionOption, MentionTextarea } from '@/components/ui/mention-textarea'
import { RelativeTime } from '@/components/ui/relative-time'
import { Textarea } from '@/components/ui/textarea'
import { useCoreloomI18n } from '@/lib/i18n'
import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'

interface CommentAuthor {
  name: string
  /** An image URL; the initials show without one. */
  avatar?: string
}

interface CommentReaction {
  emoji: string
  count: number
  /** The current person reacted with it: the chip is pressed. */
  reacted?: boolean
}

interface CommentData {
  id: string
  author: CommentAuthor
  /** Plain text; "@name" mentions of `mentionables` are drawn as mentions. */
  body: string
  createdAt: Date | string | number
  edited?: boolean
  reactions?: CommentReaction[]
  /** Replies, oldest first. Replies have no replies of their own. */
  replies?: CommentData[]
}

/** The body with "@value" drawn as a mention when value is one of the mentionables. */
function Body({ text, mentionables }: { text: string; mentionables?: MentionOption[] }) {
  if (!mentionables?.length) return <>{text}</>
  const known = new Map(mentionables.map((m) => [m.value, m.label]))
  const parts: React.ReactNode[] = []
  const pattern = /@([\p{L}\p{N}_.-]+)/gu
  let from = 0
  for (const match of text.matchAll(pattern)) {
    const value = (match.at(1) ?? '').replace(/[.-]+$/, '')
    if (!known.has(value)) continue
    const start = match.index
    if (start > from) parts.push(text.slice(from, start))
    parts.push(
      <span
        key={start}
        title={known.get(value)}
        className="rounded-sm bg-primary-subtle px-0.5 font-medium text-primary-text"
      >
        @{value}
      </span>,
    )
    from = start + value.length + 1
  }
  parts.push(text.slice(from))
  return <>{parts}</>
}

function CommentComposer({
  onSubmit,
  onCancel,
  placeholder,
  submitLabel,
  mentionables,
  autoFocus,
  author,
  'aria-label': ariaLabel,
}: {
  onSubmit: (text: string) => void
  onCancel?: () => void
  placeholder?: string
  submitLabel?: string
  mentionables?: MentionOption[]
  autoFocus?: boolean
  /** Shows their avatar beside the box. */
  author?: CommentAuthor
  'aria-label'?: string
}) {
  const t = useCoreloomI18n().messages.display.comments
  const [text, setText] = React.useState('')
  const wrapper = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (autoFocus) wrapper.current?.querySelector('textarea')?.focus()
  }, [autoFocus])
  const submit = () => {
    const value = text.trim()
    if (!value) return
    onSubmit(value)
    setText('')
  }
  const label = ariaLabel ?? placeholder ?? t.placeholder
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- shortcuts for the box inside (Ctrl+Enter sends, Escape cancels)
    <div
      ref={wrapper}
      data-slot="comment-composer"
      className="flex gap-3"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          submit()
        } else if (e.key === 'Escape' && onCancel && !e.defaultPrevented) {
          onCancel()
        }
      }}
    >
      {author ? <AuthorAvatar author={author} /> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {mentionables?.length ? (
          <MentionTextarea
            options={mentionables}
            value={text}
            onValueChange={setText}
            rows={2}
            placeholder={placeholder ?? t.placeholder}
            aria-label={label}
          />
        ) : (
          <Textarea
            value={text}
            rows={2}
            placeholder={placeholder ?? t.placeholder}
            aria-label={label}
            onChange={(e) => {
              setText(e.target.value)
            }}
          />
        )}
        <div className="flex justify-end gap-2">
          {onCancel ? (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              {t.cancel}
            </Button>
          ) : null}
          <Button type="button" size="sm" disabled={!text.trim()} onClick={submit}>
            {submitLabel ?? t.send}
          </Button>
        </div>
      </div>
    </div>
  )
}

function AuthorAvatar({ author, small }: { author: CommentAuthor; small?: boolean }) {
  return (
    <Avatar size={small ? 'sm' : 'default'} className={cn(small ? 'mt-0.5' : '')}>
      {author.avatar ? <AvatarImage src={author.avatar} alt="" /> : null}
      <AvatarFallback>{initials(author.name)}</AvatarFallback>
    </Avatar>
  )
}

function Comment({
  comment,
  reply,
  mentionables,
  now,
  onReact,
  onReply,
}: {
  comment: CommentData
  reply?: boolean
  mentionables?: MentionOption[]
  now?: Date | number
  onReact?: (commentId: string, emoji: string) => void
  onReply?: () => void
}) {
  const t = useCoreloomI18n().messages.display.comments
  return (
    <article
      data-slot="comment"
      aria-labelledby={`comment-${comment.id}-author`}
      className="flex gap-3"
    >
      <AuthorAvatar author={comment.author} small={reply} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-[13px]">
          <span id={`comment-${comment.id}-author`} className="font-semibold text-foreground">
            {comment.author.name}
          </span>
          <RelativeTime date={comment.createdAt} now={now} className="text-muted-foreground" />
          {comment.edited ? <span className="text-muted-foreground">· {t.edited}</span> : null}
        </p>
        <p className="m-0 text-[14px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-foreground">
          <Body text={comment.body} mentionables={mentionables} />
        </p>
        <div className="-ml-1.5 flex flex-wrap items-center gap-1">
          {comment.reactions?.map((r) => (
            <button
              key={r.emoji}
              type="button"
              aria-pressed={r.reacted ?? false}
              aria-label={t.reaction(r.emoji, r.count, r.reacted ?? false)}
              disabled={!onReact}
              className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border border-border bg-card px-2 text-[12.5px] text-fg-secondary tabular-nums outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-default aria-pressed:border-primary aria-pressed:bg-primary-subtle aria-pressed:text-primary-text"
              onClick={() => onReact?.(comment.id, r.emoji)}
            >
              <span aria-hidden>{r.emoji}</span>
              <span aria-hidden>{r.count}</span>
            </button>
          ))}
          {onReact ? (
            <EmojiPicker
              label={t.addReaction}
              onSelect={(emoji) => {
                onReact(comment.id, emoji.emoji)
              }}
            >
              <button
                type="button"
                aria-label={t.addReaction}
                title={t.addReaction}
                className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring [&_svg]:size-4"
              >
                <SmilePlusIcon />
              </button>
            </EmojiPicker>
          ) : null}
          {onReply ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[12.5px] text-muted-foreground"
              aria-label={t.replyTo(comment.author.name)}
              onClick={onReply}
            >
              {t.reply}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function CommentThread({
  comments,
  currentUser,
  mentionables,
  onSubmit,
  onReact,
  collapseRepliesAfter = 3,
  now,
  className,
  'aria-label': ariaLabel,
}: {
  comments: CommentData[]
  /** The person writing: their avatar sits by the box. */
  currentUser?: CommentAuthor
  /** People "@" suggests in the box; their mentions are drawn in the comments. */
  mentionables?: MentionOption[]
  /** A new comment, or a reply to `parentId`. Without it, the thread is read only. */
  onSubmit?: (text: string, parentId?: string) => void
  /** Toggle a reaction. Without it, reactions only show. */
  onReact?: (commentId: string, emoji: string) => void
  /** Beyond this many replies, the earlier ones fold behind "Show n replies". Default 3. */
  collapseRepliesAfter?: number
  /** Count times from this moment (frozen wording). */
  now?: Date | number
  className?: string
  'aria-label'?: string
}) {
  const t = useCoreloomI18n().messages.display.comments
  const [replyingTo, setReplyingTo] = React.useState<string | null>(null)
  const [unfolded, setUnfolded] = React.useState<ReadonlySet<string>>(() => new Set())

  return (
    <section
      data-slot="comment-thread"
      aria-label={ariaLabel ?? t.label}
      className={cn('flex flex-col gap-5 font-sans', className)}
    >
      {comments.length === 0 ? (
        <p className="m-0 text-[13.5px] text-muted-foreground">{t.empty}</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-5 p-0">
          {comments.map((comment) => {
            const replies = comment.replies ?? []
            const folded =
              replies.length > collapseRepliesAfter && !unfolded.has(comment.id)
                ? replies.length - 1
                : 0
            const shown = folded ? replies.slice(-1) : replies
            return (
              <li key={comment.id} className="flex flex-col gap-3">
                <Comment
                  comment={comment}
                  mentionables={mentionables}
                  now={now}
                  onReact={onReact}
                  onReply={
                    onSubmit
                      ? () => {
                          setReplyingTo(comment.id)
                        }
                      : undefined
                  }
                />
                {replies.length || replyingTo === comment.id ? (
                  <div className="ml-4 flex flex-col gap-3 border-l border-border-subtle pl-[27px]">
                    {replies.length > collapseRepliesAfter ? (
                      <button
                        type="button"
                        aria-expanded={!folded}
                        className="cursor-pointer self-start rounded-sm text-[12.5px] font-medium text-primary-text outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring"
                        onClick={() => {
                          setUnfolded((prev) => {
                            const next = new Set(prev)
                            if (next.has(comment.id)) next.delete(comment.id)
                            else next.add(comment.id)
                            return next
                          })
                        }}
                      >
                        {folded ? t.showReplies(folded) : t.hideReplies}
                      </button>
                    ) : null}
                    {shown.length ? (
                      <ol className="m-0 flex list-none flex-col gap-3 p-0">
                        {shown.map((r) => (
                          <li key={r.id}>
                            <Comment
                              comment={r}
                              reply
                              mentionables={mentionables}
                              now={now}
                              onReact={onReact}
                              onReply={
                                onSubmit
                                  ? () => {
                                      setReplyingTo(comment.id)
                                    }
                                  : undefined
                              }
                            />
                          </li>
                        ))}
                      </ol>
                    ) : null}
                    {replyingTo === comment.id && onSubmit ? (
                      <CommentComposer
                        autoFocus
                        mentionables={mentionables}
                        placeholder={t.replyPlaceholder}
                        submitLabel={t.sendReply}
                        aria-label={t.replyTo(comment.author.name)}
                        onSubmit={(text) => {
                          onSubmit(text, comment.id)
                          setReplyingTo(null)
                        }}
                        onCancel={() => {
                          setReplyingTo(null)
                        }}
                      />
                    ) : null}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>
      )}
      {onSubmit ? (
        <CommentComposer
          author={currentUser}
          mentionables={mentionables}
          onSubmit={(text) => {
            onSubmit(text)
          }}
        />
      ) : null}
    </section>
  )
}

export {
  type CommentAuthor,
  CommentComposer,
  type CommentData,
  type CommentReaction,
  CommentThread,
}
