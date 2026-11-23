'use client'

// Coreloom UI — AI chat (block). A conversation with a model, ready for the AI SDK's useChat:
//
//   const { messages, status, error, sendMessage, stop, regenerate, addToolApprovalResponse } = useChat()
//   <Chat messages={messages} status={status} error={error}
//     onSend={({ text, files }) => sendMessage({ text, files })} onStop={stop}
//     onRegenerate={() => regenerate()} onToolApprovalResponse={addToolApprovalResponse} />
//
// Parts: Chat (the whole thing), ChatMessages (the scrolling log), ChatMessage (one message: text in
// Markdown with inline citations, reasoning, tool calls, files, sources; a user's message can be edited,
// and a message with other versions shows "‹ 2 / 3 ›"), ChatEmpty (suggestions) and ConversationList (the
// history beside it). `tools` draws tool calls as your own components (generative UI):
//
//   <Chat … tools={{ getWeather: { label: 'Weather', display: 'inline', render: ({ state, output }) =>
//     state === 'output-available' ? <WeatherCard {...output} /> : <WeatherCardSkeleton /> } }} />
//
// `data-plan` parts show as a live AgentPlan (steps ticked off as the agent works); `renderData` draws
// other data parts. Tools that ask the person first (`formTool()`) answer through `onToolOutput`.
import {
  ArrowDownIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  FileIcon,
  LinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SparklesIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Trash2Icon,
} from 'lucide-react'
import * as React from 'react'

import { AgentAvatar } from '@/components/ui/agent-avatar'
import { AgentPlan } from '@/components/ui/agent-plan'
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
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { safeSourceUrl, sourceTitle } from '@/components/ui/inline-citation'
import { Input } from '@/components/ui/input'
import { Markdown } from '@/components/ui/markdown'
import { PromptInput } from '@/components/ui/prompt-input'
import { Reasoning } from '@/components/ui/reasoning'
import { Textarea } from '@/components/ui/textarea'
import {
  ToolCall,
  type ToolCallback,
  type ToolComponents,
  type ToolOutputResponse,
} from '@/components/ui/tool-call'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  type AiChatStatus,
  type AiDataPart,
  type AiMessage,
  type AiSourceDocumentPart,
  type AiSourceUrlPart,
  type AiToolPart,
  isDataPart,
  isFilePart,
  isReasoningPart,
  isSourcePart,
  isTextPart,
  isToolPart,
  messageText,
  readPlan,
} from '@/lib/ai'
import { useCoreloomI18n } from '@/lib/i18n'
import { AppLink } from '@/lib/link'
import { cn } from '@/lib/utils'

type Feedback = 'good' | 'bad'

/**
 * Where a message stands among its versions (other answers after Regenerate, other wordings after an
 * edit): `index` is the version shown, from 0, out of `count`.
 */
interface Branch {
  index: number
  count: number
}

interface MessageOptions {
  /** A user message was edited (Save). The app keeps the messages before it, replaces it, and asks again. */
  onEdit?: (messageId: string, text: string) => void
  /** Versions by message id: those with `count` > 1 show "‹ 2 / 3 ›". */
  branches?: Record<string, Branch | undefined>
  /** Show another version (`index` from 0) of the message with this id. */
  onBranchChange?: (messageId: string, index: number) => void
}

interface AvatarOptions {
  /**
   * Draw the assistant as an animated AgentAvatar that thinks while it waits and talks while it
   * writes: `{ variant: 'dots' }`, `{ seed: agent.id }`… Left out, a sparkle.
   */
  assistantAvatar?: Pick<
    React.ComponentProps<typeof AgentAvatar>,
    'variant' | 'seed' | 'tone' | 'eyes' | 'shape'
  >
}

interface ToolOptions {
  /**
   * Generative UI: a component per tool, by name, drawn for the call in any state — inside its card
   * or in place of it (`display: 'inline'`). Type it from your tools with `ToolComponents<…>`.
   */
  tools?: ToolComponents
  /** Human names for tools, by id: { searchDocs: "Search the docs" }. `tools[name].label` wins. */
  toolLabels?: Record<string, React.ReactNode>
  /** Draw a tool's output yourself (by tool id); JSON otherwise. `tools` takes precedence. */
  renderToolOutput?: (toolName: string, output: unknown) => React.ReactNode | undefined
  onToolApprovalResponse?: (response: { id: string; approved: boolean }) => void
  /** Answers from tools that wait for the person (`awaitsInput`, `formTool()`): wire `addToolOutput`. */
  onToolOutput?: ToolCallback<ToolOutputResponse>
  /**
   * Draw a data part (`data-<name>`) yourself; return undefined to leave it to the chat, which draws
   * `data-plan` as an AgentPlan and skips the others, or null to hide it.
   */
  renderData?: (part: AiDataPart) => React.ReactNode
}

function IconAction({
  label,
  onClick,
  pressed,
  disabled,
  buttonRef,
  action,
  children,
}: {
  label: string
  onClick: () => void
  pressed?: boolean
  /** aria-disabled, not disabled: the button keeps focus when it runs out (the last version). */
  disabled?: boolean
  buttonRef?: React.Ref<HTMLButtonElement>
  /** data-action, to find the button again (focus after a swap). */
  action?: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          ref={buttonRef}
          data-action={action}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={pressed}
          aria-disabled={disabled ? true : undefined}
          onClick={() => !disabled && onClick()}
          className={cn(
            'text-muted-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-45 aria-disabled:hover:bg-transparent aria-pressed:text-primary-text',
            pressed && 'bg-primary-subtle',
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** "‹ 2 / 3 ›": the versions of a message. ChatMessages announces the change and keeps focus on the arrow. */
function BranchPicker({
  branch,
  disabled,
  onChange,
}: {
  branch: Branch
  disabled?: boolean
  onChange: (index: number) => void
}) {
  const t = useCoreloomI18n().messages.ai.chat
  const { index, count } = branch
  return (
    <div
      role="group"
      aria-label={t.versions}
      data-slot="chat-branches"
      className="flex items-center"
    >
      <IconAction
        label={t.previousVersion}
        action="previous"
        disabled={!!disabled || index <= 0}
        onClick={() => {
          onChange(index - 1)
        }}
      >
        <ChevronLeftIcon />
      </IconAction>
      <span className="min-w-9 text-center font-mono text-[12px] text-muted-foreground tabular-nums">
        <span aria-hidden>
          {index + 1} / {count}
        </span>
        <span className="sr-only">{t.version(index + 1, count)}</span>
      </span>
      <IconAction
        label={t.nextVersion}
        action="next"
        disabled={!!disabled || index >= count - 1}
        onClick={() => {
          onChange(index + 1)
        }}
      >
        <ChevronRightIcon />
      </IconAction>
    </div>
  )
}

/** A user message in place: the text in a box, Save (Ctrl / ⌘ + Enter) and Cancel (Escape). */
function EditMessage({
  text,
  onSave,
  onCancel,
}: {
  text: string
  onSave: (text: string) => void
  onCancel: () => void
}) {
  const t = useCoreloomI18n().messages.ai.chat
  const [value, setValue] = React.useState(text)
  const hintId = React.useId()
  const ref = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => {
    const box = ref.current
    if (!box) return
    box.focus()
    box.setSelectionRange(box.value.length, box.value.length)
  }, [])
  const trimmed = value.trim()
  const save = () => {
    if (!trimmed) return
    if (trimmed === text.trim()) onCancel()
    else onSave(trimmed)
  }
  return (
    <form
      data-slot="chat-edit"
      className="flex w-full max-w-[85%] flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
        }}
        aria-label={t.editLabel}
        aria-describedby={hintId}
        className="max-h-80 min-h-[72px] text-[14.5px] leading-[1.6]"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onCancel()
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
            e.preventDefault()
            save()
          }
        }}
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span id={hintId} className="mr-auto text-[12px] text-muted-foreground">
          {t.editHint}
        </span>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t.cancelEdit}
        </Button>
        <Button type="submit" size="sm" disabled={!trimmed}>
          {t.save}
        </Button>
      </div>
    </form>
  )
}

function Sources({ sources }: { sources: (AiSourceUrlPart | AiSourceDocumentPart)[] }) {
  const t = useCoreloomI18n().messages.ai.chat
  return (
    <div className="flex flex-col gap-1.5" data-slot="chat-sources">
      <span className="font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {t.sources}
      </span>
      <ol className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {sources.map((s, i) => {
          // Only http(s) and mailto addresses become links; anything else (javascript:, data:) is shown, not linked.
          const href = s.type === 'source-url' ? safeSourceUrl(s.url) : undefined
          return (
            <li key={s.sourceId} data-citation={i + 1}>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={t.citation(i + 1, sourceTitle(s))}
                  className="inline-flex max-w-64 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[12px] text-foreground outline-none hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring"
                >
                  <span className="font-mono text-[11px] text-muted-foreground">{i + 1}</span>
                  <span className="truncate">{sourceTitle(s)}</span>
                  <LinkIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                </a>
              ) : (
                <span className="inline-flex max-w-64 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[12px] text-foreground">
                  <span className="font-mono text-[11px] text-muted-foreground">{i + 1}</span>
                  <span className="truncate">{sourceTitle(s)}</span>
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function Attachment({ part }: { part: { mediaType: string; url: string; filename?: string } }) {
  if (part.mediaType.startsWith('image/'))
    return (
      <img
        src={part.url}
        alt={part.filename ?? ''}
        className="max-h-48 max-w-64 rounded-md border border-border object-cover"
      />
    )
  return (
    <a
      href={part.url}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[12.5px] text-foreground outline-none hover:border-border-strong focus-visible:ring-[3px] focus-visible:ring-ring"
    >
      <FileIcon className="size-3.5 text-muted-foreground" aria-hidden />
      {part.filename ?? part.mediaType}
    </a>
  )
}

/** One message. Assistant messages render their parts in order; user messages are a bubble. */
function ChatMessage({
  message,
  streaming = false,
  isLast = false,
  feedback,
  onFeedback,
  onRegenerate,
  onEdit,
  branch,
  onBranchChange,
  busy = false,
  tools,
  toolLabels,
  renderToolOutput,
  onToolApprovalResponse,
  onToolOutput,
  renderData,
  assistantAvatar,
  className,
}: {
  message: AiMessage
  /** This message is the one being written. */
  streaming?: boolean
  /** The last message (only it offers Regenerate). */
  isLast?: boolean
  feedback?: Feedback
  onFeedback?: (messageId: string, feedback: Feedback | undefined) => void
  onRegenerate?: () => void
  /** Offers Edit on a user message; called with the new text on Save. */
  onEdit?: (messageId: string, text: string) => void
  /** This message's versions: "‹ 2 / 3 ›" when `count` > 1. */
  branch?: Branch
  onBranchChange?: (messageId: string, index: number) => void
  /** A reply is on its way: Edit hides and the versions wait. */
  busy?: boolean
  className?: string
} & ToolOptions &
  AvatarOptions) {
  const t = useCoreloomI18n().messages.ai.chat
  const [copied, setCopied] = React.useState(false)
  // Editing belongs to one message: if another takes this place, the box doesn't carry over.
  const [editingId, setEditingId] = React.useState<string>()
  const editing = editingId === message.id
  const setEditing = (on: boolean) => {
    setEditingId(on ? message.id : undefined)
  }
  const editButton = React.useRef<HTMLButtonElement>(null)
  const wasEditing = React.useRef(false)
  React.useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => {
      setCopied(false)
    }, 1400)
    return () => {
      clearTimeout(timer)
    }
  }, [copied])
  // Back from editing with Cancel: the cursor returns to Edit (after Save, ChatMessages moves it to the message).
  const cancelled = React.useRef(false)
  React.useEffect(() => {
    if (wasEditing.current && !editing && cancelled.current) editButton.current?.focus()
    cancelled.current = false
    wasEditing.current = editing
  }, [editing])

  if (message.role === 'system') return null

  const branches =
    branch && branch.count > 1 && onBranchChange ? (
      <BranchPicker
        branch={branch}
        disabled={busy}
        onChange={(index) => {
          onBranchChange(message.id, index)
        }}
      />
    ) : null

  if (message.role === 'user') {
    const text = messageText(message)
    const canEdit = !!onEdit && !!text && !busy
    return (
      <article
        data-slot="chat-message"
        data-role="user"
        aria-label={t.you}
        className={cn('group/message flex flex-col items-end gap-2 outline-none', className)}
      >
        {message.parts.filter(isFilePart).length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {message.parts.filter(isFilePart).map((p, i) => (
              // eslint-disable-next-line @eslint-react/no-array-index-key -- a sent message's attachments never reorder
              <Attachment key={i} part={p} />
            ))}
          </div>
        )}
        {editing ? (
          <EditMessage
            text={text}
            onCancel={() => {
              cancelled.current = true
              setEditing(false)
            }}
            onSave={(next) => {
              setEditing(false)
              onEdit?.(message.id, next)
            }}
          />
        ) : (
          text && (
            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-secondary px-4 py-2.5 text-[14.5px] leading-[1.6] break-words whitespace-pre-wrap text-foreground">
              {text}
            </div>
          )
        )}
        {!editing && (canEdit || branches) && (
          <div className="-mt-1 -mr-1.5 flex items-center gap-0.5">
            {branches}
            {canEdit && (
              // Shown on hover and focus; always on touch screens, which can't hover.
              <div className="opacity-0 transition-opacity duration-fast group-focus-within/message:opacity-100 group-hover/message:opacity-100 pointer-coarse:opacity-100">
                <IconAction
                  label={t.edit}
                  buttonRef={editButton}
                  onClick={() => {
                    setEditing(true)
                  }}
                >
                  <PencilIcon />
                </IconAction>
              </div>
            )}
          </div>
        )}
      </article>
    )
  }

  const textParts = message.parts.filter(isTextPart)
  const lastText = textParts[textParts.length - 1]
  const sources = message.parts.filter(isSourcePart)
  return (
    <article
      data-slot="chat-message"
      data-role="assistant"
      aria-label={t.assistant}
      aria-busy={streaming || undefined}
      className={cn('flex gap-3 outline-none', className)}
    >
      {assistantAvatar ? (
        <AgentAvatar
          {...assistantAvatar}
          state={streaming ? (textParts.some((p) => p.text) ? 'speaking' : 'thinking') : 'idle'}
          decorative
          className="mt-0.5 size-7"
        />
      ) : (
        <div
          aria-hidden
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary-text"
        >
          <SparklesIcon className="size-3.5" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {message.parts.map((part, i) => {
          if (isTextPart(part))
            return part.text ? (
              <Markdown
                // eslint-disable-next-line @eslint-react/no-array-index-key -- parts only get appended, never reordered
                key={i}
                streaming={streaming && part === lastText && part.state !== 'done'}
                sources={sources}
              >
                {part.text}
              </Markdown>
            ) : null
          if (isReasoningPart(part))
            return (
              <Reasoning
                // eslint-disable-next-line @eslint-react/no-array-index-key -- parts only get appended, never reordered
                key={i}
                text={part.text}
                streaming={streaming && part.state === 'streaming'}
              />
            )
          if (isToolPart(part)) {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- narrows the union for TS 7 (TS 6, which the linter runs on, narrows it already)
            const tool = part as AiToolPart
            const name = tool.type === 'dynamic-tool' ? (tool.toolName ?? '') : tool.type.slice(5)
            const ui = tools?.[name]
            return (
              <ToolCall
                key={tool.toolCallId}
                part={tool}
                label={ui?.label ?? toolLabels?.[name]}
                tool={ui}
                renderOutput={
                  renderToolOutput ? (output) => renderToolOutput(name, output) : undefined
                }
                onApprovalResponse={onToolApprovalResponse}
                onOutput={onToolOutput}
              />
            )
          }
          if (isDataPart(part)) {
            // Parts with an id are rewritten in place as the server updates them; key on it.
            const key = part.id ?? `${part.type}-${String(i)}`
            const custom = renderData?.(part)
            if (custom !== undefined) return <React.Fragment key={key}>{custom}</React.Fragment>
            const plan = part.type === 'data-plan' ? readPlan(part.data) : undefined
            return plan ? <AgentPlan key={key} plan={plan} active={streaming} /> : null
          }
          // eslint-disable-next-line @eslint-react/no-array-index-key -- parts only get appended, never reordered
          if (isFilePart(part)) return <Attachment key={i} part={part} />
          return null
        })}
        {sources.length > 0 && <Sources sources={sources} />}
        {!streaming && (
          <div className="-ml-1.5 flex items-center gap-0.5">
            {branches}
            <IconAction
              label={t.copy}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(messageText(message))
                  setCopied(true)
                } catch {
                  /* clipboard unavailable */
                }
              }}
            >
              {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
            </IconAction>
            {isLast && onRegenerate && (
              <IconAction label={t.regenerate} onClick={onRegenerate}>
                <RefreshCwIcon />
              </IconAction>
            )}
            {onFeedback && (
              <>
                <IconAction
                  label={t.good}
                  pressed={feedback === 'good'}
                  onClick={() => {
                    onFeedback(message.id, feedback === 'good' ? undefined : 'good')
                  }}
                >
                  <ThumbsUpIcon />
                </IconAction>
                <IconAction
                  label={t.bad}
                  pressed={feedback === 'bad'}
                  onClick={() => {
                    onFeedback(message.id, feedback === 'bad' ? undefined : 'bad')
                  }}
                >
                  <ThumbsDownIcon />
                </IconAction>
              </>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

/**
 * Keeps a scroll box pinned to the bottom while content grows, unless the reader scrolled up.
 * Returns the box's ref, whether it's pinned, and a function to jump back down.
 */
function useStickToBottom<T extends HTMLElement>() {
  const ref = React.useRef<T>(null)
  const [pinned, setPinned] = React.useState(true)
  const pinnedRef = React.useRef(true)
  React.useEffect(() => {
    const box = ref.current
    if (!box) return
    const onScroll = () => {
      const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 48
      pinnedRef.current = atBottom
      setPinned(atBottom)
    }
    const follow = () => {
      if (pinnedRef.current) box.scrollTop = box.scrollHeight
    }
    box.addEventListener('scroll', onScroll, { passive: true })
    const observer = new ResizeObserver(follow)
    for (const child of Array.from(box.children)) observer.observe(child)
    follow()
    return () => {
      box.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [])
  const scrollToBottom = React.useCallback(() => {
    const box = ref.current
    if (!box) return
    pinnedRef.current = true
    setPinned(true)
    box.scrollTo({
      top: box.scrollHeight,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  }, [])
  return { ref, pinned, scrollToBottom }
}

function TypingIndicator({ assistantAvatar }: AvatarOptions) {
  const t = useCoreloomI18n().messages.ai.chat
  return (
    <div data-slot="chat-typing" className="flex gap-3">
      {assistantAvatar ? (
        <AgentAvatar {...assistantAvatar} state="thinking" decorative className="size-7" />
      ) : (
        <div
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary-text"
        >
          <SparklesIcon className="size-3.5" />
        </div>
      )}
      <div className="flex h-7 items-center gap-1">
        {/* The log reads what is added to it: the words are for it, the dots for the eyes. */}
        <span className="sr-only">{t.waiting}</span>
        {[0, 150, 300].map((d) => (
          <span
            key={d}
            className="size-1.5 animate-bounce rounded-full bg-muted-foreground motion-reduce:animate-none"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

/** The scrolling log of messages, kept at the latest one while it streams. */
function ChatMessages({
  messages,
  status = 'ready',
  error,
  onRetry,
  onRegenerate,
  feedback,
  onFeedback,
  onEdit,
  branches,
  onBranchChange,
  assistantAvatar,
  className,
  ...toolOptions
}: {
  messages: readonly AiMessage[]
  status?: AiChatStatus
  /** useChat's error; shown with Try again. */
  error?: Error | string | null
  onRetry?: () => void
  onRegenerate?: () => void
  /** Feedback given so far, by message id. */
  feedback?: Record<string, Feedback | undefined>
  onFeedback?: (messageId: string, feedback: Feedback | undefined) => void
  className?: string
} & MessageOptions &
  ToolOptions &
  AvatarOptions) {
  const t = useCoreloomI18n().messages.ai.chat
  const { ref, pinned, scrollToBottom } = useStickToBottom<HTMLDivElement>()
  const last = messages[messages.length - 1]
  const streaming = status === 'streaming'
  const visible = messages.filter((m) => m.role !== 'system')
  const busy = status === 'submitted' || streaming

  // Switching versions or saving an edit usually swaps the message for another (another id, so it
  // remounts) and the button the reader pressed goes with it. Remember where focus should land — the
  // same arrow, or the edited message — and put it back once the new messages are in.
  const pending = React.useRef<{
    position: number
    target: 'previous' | 'next' | 'message'
    from: readonly AiMessage[]
  }>(undefined)
  const [announcement, setAnnouncement] = React.useState('')
  React.useLayoutEffect(() => {
    const want = pending.current
    const box = ref.current
    if (!want || !box) return
    if (!document.activeElement || document.activeElement === document.body) {
      const article = box.querySelectorAll<HTMLElement>('[data-slot=chat-message]')[
        want.position
      ] as HTMLElement | undefined
      const target =
        want.target === 'message'
          ? article
          : article?.querySelector<HTMLElement>(
              `[data-slot=chat-branches] [data-action=${want.target}]`,
            )
      if (target) {
        if (want.target === 'message') target.tabIndex = -1
        target.focus()
      }
    }
    if (messages !== want.from) pending.current = undefined
  })

  const changeBranch = (position: number) => (id: string, index: number) => {
    const branch = branches?.[id]
    if (!branch || !onBranchChange) return
    pending.current = {
      position,
      target: index < branch.index ? 'previous' : 'next',
      from: messages,
    }
    // One live region for the whole log, saying only what changed; a no-break space makes a repeat announce again.
    setAnnouncement(
      (before) => t.version(index + 1, branch.count) + (before.endsWith('\u00a0') ? '' : '\u00a0'),
    )
    onBranchChange(id, index)
  }
  const edit = (position: number) => (id: string, text: string) => {
    pending.current = { position, target: 'message', from: messages }
    onEdit?.(id, text)
  }

  return (
    <div className={cn('relative flex min-h-0 flex-1 flex-col', className)}>
      <p
        data-slot="chat-announcer"
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic
      >
        {announcement}
      </p>
      <div
        ref={ref}
        data-slot="chat-messages"
        role="log"
        aria-label={t.log}
        aria-live="polite"
        aria-relevant="additions"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable/region must be keyboard-reachable; axe requires it
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
          {visible.map((m, i) => (
            <ChatMessage
              key={m.id}
              message={m}
              streaming={streaming && m === last && m.role === 'assistant'}
              isLast={m === last}
              feedback={feedback?.[m.id]}
              onFeedback={onFeedback}
              onRegenerate={onRegenerate}
              onEdit={onEdit && edit(i)}
              branch={branches?.[m.id]}
              onBranchChange={onBranchChange && changeBranch(i)}
              busy={busy}
              assistantAvatar={assistantAvatar}
              {...toolOptions}
            />
          ))}
          {status === 'submitted' && <TypingIndicator assistantAvatar={assistantAvatar} />}
          {(status === 'error' || error) && (
            // The log already reads what is added to it: an alert of its own would be read twice.
            <Alert variant="destructive" role="none">
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>{typeof error === 'string' ? error : t.error}</span>
                {onRetry && (
                  <Button size="sm" variant="outline" onClick={onRetry}>
                    <RefreshCwIcon />
                    {t.retry}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
      {!pinned && (
        <Button
          type="button"
          size="icon-sm"
          variant="secondary"
          aria-label={t.scrollToLatest}
          onClick={scrollToBottom}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-md"
        >
          <ArrowDownIcon />
        </Button>
      )}
    </div>
  )
}

/** The empty state: a greeting and a few suggested prompts. */
function ChatEmpty({
  title,
  description,
  suggestions = [],
  onSuggestion,
  className,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  suggestions?: string[]
  onSuggestion?: (text: string) => void
  className?: string
}) {
  const t = useCoreloomI18n().messages.ai.chat
  return (
    <div
      data-slot="chat-empty"
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10 text-center',
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-primary-subtle text-primary-text">
        <SparklesIcon className="size-5" aria-hidden />
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="m-0 font-display text-[22px] font-semibold tracking-[-0.015em] text-foreground">
          {title ?? t.emptyTitle}
        </h2>
        <p className="m-0 text-[14px] text-muted-foreground">{description ?? t.emptyDescription}</p>
      </div>
      {suggestions.length > 0 && (
        <ul className="m-0 grid w-full max-w-2xl list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => onSuggestion?.(s)}
                className="w-full cursor-pointer rounded-lg border border-border bg-card px-4 py-3 text-left text-[13.5px] text-foreground transition-colors duration-fast outline-none hover:border-border-strong hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The whole chat: messages (or suggestions when empty) above the prompt. */
function Chat({
  messages,
  status = 'ready',
  error,
  onSend,
  onStop,
  onRegenerate,
  feedback,
  onFeedback,
  onEdit,
  branches,
  onBranchChange,
  suggestions,
  emptyTitle,
  emptyDescription,
  toolbar,
  allowAttachments,
  accept,
  placeholder,
  header,
  autoFocus = true,
  className,
  ...toolOptions
}: {
  messages: readonly AiMessage[]
  status?: AiChatStatus
  error?: Error | string | null
  onSend: (message: { text: string; files: File[] }) => void
  onStop?: () => void
  /** Regenerate the last answer (and retry after an error). */
  onRegenerate?: () => void
  feedback?: Record<string, Feedback | undefined>
  onFeedback?: (messageId: string, feedback: Feedback | undefined) => void
  /** Prompts offered while the conversation is empty. */
  suggestions?: string[]
  emptyTitle?: React.ReactNode
  emptyDescription?: React.ReactNode
  /** Controls in the prompt's bottom bar (a model picker). */
  toolbar?: React.ReactNode
  allowAttachments?: boolean
  accept?: string
  placeholder?: string
  /** A bar above the messages (the conversation's title, a menu). */
  header?: React.ReactNode
  /** Put the cursor in the prompt on mount (default true: a chat page is for writing). */
  autoFocus?: boolean
  className?: string
} & MessageOptions &
  ToolOptions &
  AvatarOptions) {
  const empty = messages.filter((m) => m.role !== 'system').length === 0
  return (
    <section data-slot="chat" className={cn('flex h-full min-h-0 flex-col', className)}>
      {header}
      {empty ? (
        <ChatEmpty
          title={emptyTitle}
          description={emptyDescription}
          suggestions={suggestions}
          onSuggestion={(text) => {
            onSend({ text, files: [] })
          }}
        />
      ) : (
        <ChatMessages
          messages={messages}
          status={status}
          error={error}
          onRetry={onRegenerate}
          onRegenerate={onRegenerate}
          feedback={feedback}
          onFeedback={onFeedback}
          onEdit={onEdit}
          branches={branches}
          onBranchChange={onBranchChange}
          {...toolOptions}
        />
      )}
      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        <PromptInput
          status={status}
          onSubmit={onSend}
          onStop={onStop}
          toolbar={toolbar}
          allowAttachments={allowAttachments}
          accept={accept}
          placeholder={placeholder}
          autoFocus={autoFocus}
        />
      </div>
    </section>
  )
}

interface Conversation {
  id: string
  title: string
  updatedAt: Date | string
}

function groupConversations(conversations: Conversation[], now: Date) {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const today = day(now)
  const groups = {
    today: [] as Conversation[],
    yesterday: [] as Conversation[],
    week: [] as Conversation[],
    older: [] as Conversation[],
  }
  for (const c of [...conversations].sort(
    (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt),
  )) {
    const diff = Math.round((today - day(new Date(c.updatedAt))) / 86_400_000)
    groups[diff <= 0 ? 'today' : diff === 1 ? 'yesterday' : diff < 7 ? 'week' : 'older'].push(c)
  }
  return groups
}

/** Focuses a conversation's link or button; false when the row is gone. */
function focusConversation(row: Element | null | undefined) {
  const target = row?.isConnected ? row.querySelector<HTMLElement>('a, button') : null
  target?.focus()
  return !!target
}

/** One conversation: a link or a button, Rename and Delete in its menu; renaming happens in place. */
function ConversationRow({
  conversation: c,
  active,
  href,
  onSelect,
  onRename,
  onDelete,
}: {
  conversation: Conversation
  active: boolean
  href?: (id: string) => string
  onSelect?: (id: string) => void
  onRename?: (id: string, title: string) => void
  /** Delete was chosen in the menu: the list asks before it deletes. */
  onDelete?: (conversation: Conversation) => void
}) {
  const t = useCoreloomI18n().messages.ai.conversations
  const [renaming, setRenaming] = React.useState(false)
  const rowRef = React.useRef<HTMLLIElement>(null)
  const rowClass = cn(
    'flex min-w-0 flex-1 items-center rounded-md px-2.5 py-1.5 text-left text-[13.5px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
    active
      ? 'bg-primary-subtle font-medium text-foreground'
      : 'text-fg-secondary hover:bg-accent hover:text-foreground',
  )
  if (renaming)
    return (
      <li ref={rowRef} data-conversation={c.id} className="relative flex items-center">
        <Input
          autoFocus
          defaultValue={c.title}
          aria-label={t.renameLabel}
          className="h-8 text-[13.5px]"
          onBlur={() => {
            setRenaming(false)
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== 'Escape') return
            const title = e.currentTarget.value.trim()
            if (e.key === 'Enter' && title) onRename?.(c.id, title)
            setRenaming(false)
            // The field goes away with the focus: put it on the row once it is back.
            requestAnimationFrame(() => {
              focusConversation(rowRef.current)
            })
          }}
        />
      </li>
    )
  return (
    <li ref={rowRef} data-conversation={c.id} className="group/row relative flex items-center">
      {href ? (
        <AppLink href={href(c.id)} aria-current={active ? 'page' : undefined} className={rowClass}>
          <span className="truncate pr-6">{c.title}</span>
        </AppLink>
      ) : (
        <button
          type="button"
          aria-current={active ? 'true' : undefined}
          onClick={() => onSelect?.(c.id)}
          className={cn(rowClass, 'cursor-pointer')}
        >
          <span className="truncate pr-6">{c.title}</span>
        </button>
      )}
      {(!!onRename || !!onDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* Shown on hover and focus; always on touch screens, which can't hover. */}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t.actions(c.title)}
              className="absolute right-1 size-6 opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
            >
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onRename && (
              <DropdownMenuItem
                onSelect={() =>
                  setTimeout(() => {
                    setRenaming(true)
                  })
                }
              >
                <PencilIcon />
                {t.rename}
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  onDelete(c)
                }}
              >
                <Trash2Icon />
                {t.delete}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  )
}

/**
 * A deleted conversation takes its row, and the menu that had the focus, with it. `remember`
 * notes the row and its neighbour before the app removes it; `restore`, given to the
 * confirmation's `onCloseAutoFocus`, then focuses the next row (or the previous one), else the list.
 */
function useFocusAfterDelete(listRef: React.RefObject<HTMLElement | null>) {
  const removed = React.useRef<{ row?: HTMLElement; next?: HTMLElement }>(undefined)
  const remember = (id: string) => {
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-conversation]') ?? [])]
    const index = rows.findIndex((r) => r.dataset.conversation === id)
    if (index < 0) return
    removed.current = {
      row: rows.at(index),
      next: rows.at(index + 1) ?? (index > 0 ? rows.at(index - 1) : undefined),
    }
  }
  const restore = (event: Event) => {
    const gone = removed.current
    removed.current = undefined
    // Cancelled, or the app kept the row: focus goes back where it was.
    if (!gone || gone.row?.isConnected) return
    event.preventDefault()
    if (!focusConversation(gone.next)) listRef.current?.focus()
  }
  return { remember, restore }
}

/** The history of conversations: search, grouped by day, rename and delete from each row's menu. */
function ConversationList({
  conversations,
  activeId,
  onSelect,
  href,
  onNew,
  onRename,
  onDelete,
  now,
  className,
}: {
  conversations: Conversation[]
  activeId?: string
  /** Called when a row is chosen (or give `href` to make rows links). */
  onSelect?: (id: string) => void
  href?: (id: string) => string
  onNew?: () => void
  onRename?: (id: string, title: string) => void
  onDelete?: (id: string) => void
  /** "Today" is relative to this date (default: now). */
  now?: Date
  className?: string
}) {
  const all = useCoreloomI18n().messages
  const t = all.ai.conversations
  const id = React.useId()
  const listRef = React.useRef<HTMLDivElement>(null)
  const focusAfterDelete = useFocusAfterDelete(listRef)
  const [query, setQuery] = React.useState('')
  const [deleting, setDeleting] = React.useState<Conversation>()
  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const groups = groupConversations(filtered, now ?? new Date())
  const sections = (['today', 'yesterday', 'week', 'older'] as const).filter(
    (g) => groups[g].length,
  )
  // Said by the list's status: nothing to show, or how many titles match the search.
  let status = ''
  if (sections.length === 0) status = conversations.length ? t.noResults : t.empty
  else if (query.trim()) status = t.results(filtered.length)

  return (
    <nav
      data-slot="conversation-list"
      aria-label={t.title}
      className={cn('flex min-h-0 flex-col gap-3', className)}
    >
      {onNew && (
        <Button variant="outline" className="w-full justify-start" onClick={onNew}>
          <PlusIcon />
          {t.new}
        </Button>
      )}
      <div className="relative">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
          }}
          placeholder={t.search}
          aria-label={t.search}
          className="h-8 pl-8 text-[13px]"
        />
      </div>
      <div
        ref={listRef}
        tabIndex={-1}
        className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring"
      >
        {/* Always in the page, so that a search's result is announced; seen when the list is empty. */}
        <p
          role="status"
          className={
            sections.length === 0 ? 'm-0 px-2.5 text-[13px] text-muted-foreground' : 'sr-only'
          }
        >
          {status}
        </p>
        {sections.map((g) => (
          <div key={g} className="flex flex-col gap-1">
            <p
              id={`${id}-${g}`}
              className="m-0 px-2.5 font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
            >
              {t[g]}
            </p>
            <ul aria-labelledby={`${id}-${g}`} className="m-0 flex list-none flex-col gap-0.5 p-0">
              {groups[g].map((c) => (
                <ConversationRow
                  key={c.id}
                  conversation={c}
                  active={c.id === activeId}
                  href={href}
                  onSelect={onSelect}
                  onRename={onRename}
                  onDelete={onDelete && setDeleting}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(undefined)}>
        <AlertDialogContent onCloseAutoFocus={focusAfterDelete.restore}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              <strong className="text-foreground">{deleting?.title}</strong> — {t.deleteText}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{all.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!deleting) return
                focusAfterDelete.remember(deleting.id)
                onDelete?.(deleting.id)
              }}
            >
              {t.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </nav>
  )
}

export {
  type Branch,
  Chat,
  ChatEmpty,
  ChatMessage,
  ChatMessages,
  type Conversation,
  ConversationList,
  type Feedback,
}
