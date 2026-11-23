'use client'

// Coreloom UI — Chat widget (block). The support bubble in a page's corner: a round launcher (with an
// unread count and an optional greeting next to it) that opens the Chat in a card above it, or in a
// full-screen sheet on phones. It wraps the same Chat, so useChat plugs in the same way:
//
//   const { messages, status, sendMessage, stop } = useChat()
//   <ChatWidget title="Chat with Coreloom" greeting="Hi! Questions about deploys?" unread={unread}
//     messages={messages} status={status} onSend={({ text, files }) => sendMessage({ text, files })} onStop={stop} />
//
// An app with its own conversation UI passes it as children instead of the Chat's props, and can add
// controls to the header (headerActions) and let the reader enlarge the card (resizable).
//
// Not modal on a desktop: the page stays usable behind the card. Escape (or Minimise) folds it back
// into the launcher and gives focus back to it; opening puts the cursor in the composer.
import {
  Maximize2Icon,
  MessageCircleIcon,
  Minimize2Icon,
  MinusIcon,
  SparklesIcon,
  XIcon,
} from 'lucide-react'
import * as React from 'react'

import { Chat } from '@/components/ai-chat'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type ChatWidgetPresence = 'online' | 'away' | 'offline'

type ChatWidgetSize = 'default' | 'expanded'

type ChatWidgetChatProps = Omit<
  React.ComponentProps<typeof Chat>,
  'className' | 'header' | 'autoFocus'
>

/** The card's body: the built-in Chat (its props), or the app's own UI as children (the Chat's props are then ignored). */
type ChatWidgetBody =
  | (ChatWidgetChatProps & { children?: undefined })
  | (Partial<ChatWidgetChatProps> & {
      /** The app's own conversation UI, shown in the card instead of the Chat. Give it a PromptInput so opening focuses its composer. */
      children: React.ReactNode
    })

type ChatWidgetProps = ChatWidgetBody & {
  /** Controlled open state (with onOpenChange); or leave it out and use defaultOpen. */
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** The header's title; it also names the panel for screen readers. Default "Chat with us". */
  title?: React.ReactNode
  /** Under the title. Default "Usually answers in a minute". */
  subtitle?: React.ReactNode
  /** Who answers: an <Avatar> or an icon. Default a sparkle. */
  avatar?: React.ReactNode
  /** The dot on the avatar, also said to screen readers. Default "online". */
  presence?: ChatWidgetPresence
  /** Messages the reader hasn't seen: a badge on the launcher, part of its name ("Chat, 2 unread"). */
  unread?: number
  /** A bubble next to the closed launcher ("Hi! Questions about deploys?"). Shown until dismissed or opened. */
  greeting?: React.ReactNode
  /** Called once the greeting goes (dismissed or the chat opened): remember it so it shows only once. */
  onGreetingDismiss?: () => void
  /** The header's Close button: end the conversation (Minimise only hides it). The panel closes either way. */
  onClose?: () => void
  /** Corner of the page. Default "right". */
  side?: 'left' | 'right'
  /** Distance from the corner, in px. Default 24. */
  offset?: number | { x: number; y: number }
  /** Default 1200: above sticky headers (1100), under modals (1300), so its own menus (popover 1400) and toasts (1500) stay on top. */
  zIndex?: number
  /** Full-screen sheet instead of a card. Default: below 640px wide. */
  fullScreen?: boolean
  /** Controls in the header, before Minimise (a conversation switcher, "New conversation"). */
  headerActions?: React.ReactNode
  /** Shows a header button that enlarges the card (720 × 820px). Default false. Not shown in the full-screen sheet. */
  resizable?: boolean
  /** Controlled size (with onSizeChange); or leave it out and use defaultSize. */
  size?: ChatWidgetSize
  /** Default "default" (400 × 600px). */
  defaultSize?: ChatWidgetSize
  onSizeChange?: (size: ChatWidgetSize) => void
  className?: string
}

function isCustomBody(
  body: ChatWidgetBody,
): body is Extract<ChatWidgetBody, { children: React.ReactNode }> {
  return body.children !== undefined
}

const PRESENCE_DOT: Record<ChatWidgetPresence, string> = {
  online: 'bg-success',
  away: 'bg-warning',
  offline: 'bg-muted-foreground',
}

const PHONE = '(max-width: 639px)'

function useNarrow() {
  const [narrow, setNarrow] = React.useState(false)
  React.useEffect(() => {
    const mql = window.matchMedia(PHONE)
    const update = () => {
      setNarrow(mql.matches)
    }
    update()
    mql.addEventListener('change', update)
    return () => {
      mql.removeEventListener('change', update)
    }
  }, [])
  return narrow
}

// Layers that take Escape for themselves before the chat does: an open popover (a citation's card), hover
// card (the context meter), menu, listbox or dialog. Tooltips are left out: Escape on a button whose tooltip
// shows (or is still fading out) closes the chat.
const LAYERS =
  '[data-radix-popper-content-wrapper] > [data-state=open]:not([data-slot=tooltip-content]), [role=dialog][data-state=open], [role=alertdialog][data-state=open], [role=menu][data-state=open], [role=listbox][data-state=open]'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** A support chat in the page's corner: a launcher that opens the Chat above it. */
function ChatWidget({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  title,
  subtitle,
  avatar,
  presence = 'online',
  unread = 0,
  greeting,
  onGreetingDismiss,
  onClose,
  side = 'right',
  offset = 24,
  zIndex = 1200,
  fullScreen,
  headerActions,
  resizable = false,
  size: sizeProp,
  defaultSize = 'default',
  onSizeChange,
  className,
  ...body
}: ChatWidgetProps) {
  const t = useCoreloomI18n().messages.ai.widget
  const { formatNumber } = useCoreloomI18n()
  const [inner, setInner] = React.useState(defaultOpen)
  const open = openProp ?? inner
  const [greetingGone, setGreetingGone] = React.useState(defaultOpen)
  const narrow = useNarrow()
  const sheet = fullScreen ?? narrow
  const [innerSize, setInnerSize] = React.useState(defaultSize)
  const size = sizeProp ?? innerSize
  const setSize = (next: ChatWidgetSize) => {
    if (sizeProp === undefined) setInnerSize(next)
    onSizeChange?.(next)
  }

  const panelId = React.useId()
  const titleId = React.useId()
  const subtitleId = React.useId()
  const launcher = React.useRef<HTMLButtonElement>(null)
  const panel = React.useRef<HTMLDivElement>(null)
  // Focus follows every change of `open`, the widget's own or the app's, but never on mount (a page that
  // starts open keeps its scroll). Opening goes to the composer; closing goes back to the launcher only
  // when focus was in the panel (read here, before the panel hides and focus falls to <body>).
  const prevOpen = React.useRef(open)
  const focusNext = React.useRef<'composer' | 'launcher' | null>(null)
  /* eslint-disable react-hooks/refs -- focus must be read during the render that hides the panel, before it falls to <body> */
  if (prevOpen.current !== open) {
    prevOpen.current = open
    focusNext.current = open
      ? 'composer'
      : panel.current?.contains(document.activeElement)
        ? 'launcher'
        : null
  }
  /* eslint-enable react-hooks/refs */
  // Whether a popover, hover card or menu was open when Escape went down (before it closed itself).
  const layerOpen = React.useRef(false)

  const dismissGreeting = () => {
    if (greetingGone) return
    setGreetingGone(true)
    onGreetingDismiss?.()
  }
  const setOpen = (next: boolean) => {
    if (next) dismissGreeting()
    if (openProp === undefined) setInner(next)
    onOpenChange?.(next)
  }

  React.useEffect(() => {
    const target = focusNext.current
    if (!target) return
    focusNext.current = null
    const frame = requestAnimationFrame(() => {
      if (target === 'launcher') launcher.current?.focus({ preventScroll: true })
      else
        panel.current
          ?.querySelector<HTMLElement>('[data-slot=prompt-input-textarea]')
          ?.focus({ preventScroll: true })
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [open])

  React.useEffect(() => {
    if (!open) return
    // Window capture runs before Radix's own Escape listeners (on document) close their layer.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') layerOpen.current = !!document.querySelector(LAYERS)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  // The full-screen sheet covers the page: the page behind it doesn't scroll. The scrollbar's width goes
  // to padding, so nothing shifts.
  React.useEffect(() => {
    if (!open || !sheet) return
    const body = document.body
    const before = { overflow: body.style.overflow, paddingRight: body.style.paddingRight }
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    if (scrollbar > 0)
      body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + scrollbar}px`
    body.style.overflow = 'hidden'
    return () => {
      body.style.overflow = before.overflow
      body.style.paddingRight = before.paddingRight
    }
  }, [open, sheet])

  const x = typeof offset === 'number' ? offset : offset.x
  const y = typeof offset === 'number' ? offset : offset.y
  const LAUNCHER = 56
  const GAP = 16
  const showGreeting = !!greeting && !greetingGone && !open
  const titleText = title ?? t.title

  const onPanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Only keys from inside the panel's own DOM: a menu portalled out of it (focus goes there) handles its own Escape.
    if (!panel.current?.contains(e.target as Node)) return
    if (e.key === 'Escape') {
      // An inner layer (a citation's card, the context meter) closed first: the next Escape closes the chat.
      // A tooltip also marks Escape as handled, but it isn't a layer worth a second press.
      if (e.defaultPrevented && layerOpen.current) return
      e.preventDefault()
      setOpen(false)
      return
    }
    // The full-screen sheet covers the page: keep Tab inside it.
    if (sheet && e.key === 'Tab') {
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  return (
    <div
      data-slot="chat-widget"
      data-side={side}
      data-state={open ? 'open' : 'closed'}
      className={cn(
        'pointer-events-none fixed flex flex-col gap-4 font-sans',
        side === 'right' ? 'items-end' : 'items-start',
        className,
      )}
      style={{ bottom: y, [side]: x, zIndex }}
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- a dialog handles Escape and traps Tab, like Radix's */}
      <div
        ref={panel}
        id={panelId}
        data-slot="chat-widget-panel"
        data-size={size}
        role="dialog"
        aria-modal={sheet || undefined}
        aria-labelledby={titleId}
        aria-describedby={subtitleId}
        hidden={!open}
        onKeyDown={onPanelKeyDown}
        className={cn(
          'pointer-events-auto flex flex-col overflow-hidden bg-surface text-foreground outline-none',
          'duration-base ease-out motion-safe:animate-in motion-safe:fade-in-0',
          sheet
            ? 'fixed inset-0 motion-safe:slide-in-from-bottom-6'
            : cn(
                size === 'expanded' ? 'h-[820px] w-[720px]' : 'h-[600px] w-[400px]',
                'rounded-xl border border-border shadow-xl motion-safe:zoom-in-95 motion-safe:slide-in-from-bottom-2',
                side === 'right' ? 'origin-bottom-right' : 'origin-bottom-left',
              ),
          !open && 'hidden',
        )}
        style={
          sheet
            ? undefined
            : {
                maxHeight: `calc(100dvh - ${y + LAUNCHER + GAP + 16}px)`,
                maxWidth: `calc(100vw - ${2 * x}px)`,
              }
        }
      >
        <ChatWidgetHeader
          avatar={avatar}
          presence={presence}
          title={titleText}
          subtitle={subtitle ?? t.subtitle}
          titleId={titleId}
          subtitleId={subtitleId}
        >
          {headerActions}
          {resizable && !sheet && (
            <HeaderButton
              label={size === 'expanded' ? t.shrink : t.expand}
              onClick={() => {
                setSize(size === 'expanded' ? 'default' : 'expanded')
              }}
              icon={size === 'expanded' ? <Minimize2Icon /> : <Maximize2Icon />}
            />
          )}
          <HeaderButton
            label={t.minimise}
            onClick={() => {
              setOpen(false)
            }}
            icon={<MinusIcon />}
          />
          <HeaderButton
            label={t.close}
            onClick={() => {
              setOpen(false)
              onClose?.()
            }}
            icon={<XIcon />}
          />
        </ChatWidgetHeader>
        {isCustomBody(body) ? (
          <div data-slot="chat-widget-body" className="flex min-h-0 flex-1 flex-col">
            {body.children}
          </div>
        ) : (
          <Chat
            {...body}
            autoFocus={false}
            className="min-h-0 flex-1 [&_[data-slot=chat-empty]]:py-6 [&_[data-slot=chat-empty]_h2]:text-[18px] [&_[data-slot=chat-empty]_ul]:grid-cols-1! [&>div:last-child]:px-3 [&>div:last-child]:pb-3"
          />
        )}
      </div>

      <div
        className={cn(
          'pointer-events-auto flex items-end gap-3',
          side === 'left' && 'flex-row-reverse',
          open && sheet && 'hidden',
        )}
      >
        {showGreeting && (
          <div
            data-slot="chat-widget-greeting"
            className={cn(
              'relative mb-2 flex max-w-64 items-start gap-1 rounded-xl border border-border bg-popover py-1 pr-1 pl-1 text-[13.5px] text-foreground shadow-lg',
              'duration-base ease-out motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1',
              side === 'right' ? 'rounded-br-sm' : 'rounded-bl-sm',
            )}
          >
            <button
              type="button"
              onClick={() => {
                setOpen(true)
              }}
              className="min-w-0 flex-1 cursor-pointer rounded-lg px-2.5 py-1.5 text-left leading-[1.45] outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring"
            >
              {greeting}
            </button>
            <button
              type="button"
              aria-label={t.dismissGreeting}
              onClick={() => {
                dismissGreeting()
                launcher.current?.focus()
              }}
              className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        )}
        <button
          ref={launcher}
          type="button"
          data-slot="chat-widget-launcher"
          aria-label={t.launcher(unread)}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            setOpen(!open)
          }}
          className="relative inline-flex size-14 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-[background-color,box-shadow,transform] duration-base ease-out outline-none hover:bg-primary-hover hover:shadow-glow focus-visible:ring-[3px] focus-visible:ring-ring active:translate-y-px"
        >
          {open ? (
            <XIcon className="size-6" aria-hidden />
          ) : (
            <MessageCircleIcon className="size-6" aria-hidden />
          )}
          {unread > 0 && !open && (
            <span
              aria-hidden
              className="absolute -top-1 -right-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 font-mono text-[11px] font-semibold text-background ring-2 ring-background"
            >
              {unread > 99 ? '99+' : formatNumber(unread)}
            </span>
          )}
        </button>
      </div>
      <span role="status" className="sr-only">
        {!open && unread > 0 ? t.unreadStatus(unread) : ''}
      </span>
    </div>
  )
}

function HeaderButton({
  label,
  onClick,
  icon,
}: {
  label: string
  onClick: () => void
  icon: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={onClick}
          className="text-muted-foreground"
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Who answers, the title and the subtitle; the buttons (children) on the right. */
function ChatWidgetHeader({
  avatar,
  presence,
  title,
  subtitle,
  titleId,
  subtitleId,
  children,
}: {
  avatar: React.ReactNode
  presence: ChatWidgetPresence
  title: React.ReactNode
  subtitle: React.ReactNode
  titleId: string
  subtitleId: string
  children: React.ReactNode
}) {
  const t = useCoreloomI18n().messages.ai.widget
  return (
    <div
      data-slot="chat-widget-header"
      className="flex shrink-0 items-center gap-3 border-b border-border-subtle px-4 py-3"
    >
      <div className="relative shrink-0">
        {avatar ?? (
          <div
            aria-hidden
            className="flex size-9 items-center justify-center rounded-full bg-primary-subtle text-primary-text"
          >
            <SparklesIcon className="size-4" />
          </div>
        )}
        <span
          aria-hidden
          className={cn(
            'absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-surface',
            PRESENCE_DOT[presence],
          )}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <p
          id={titleId}
          className="m-0 truncate text-[14.5px] leading-snug font-semibold text-foreground"
        >
          {title}
        </p>
        <p
          id={subtitleId}
          className="m-0 truncate text-[12.5px] leading-snug text-muted-foreground"
        >
          <span className="sr-only">{t.presence[presence]}. </span>
          {subtitle}
        </p>
      </div>
      <div className="-mr-1.5 flex shrink-0 items-center gap-0.5">{children}</div>
    </div>
  )
}

export { ChatWidget, type ChatWidgetPresence, type ChatWidgetProps, type ChatWidgetSize }
