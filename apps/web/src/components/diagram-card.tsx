import {
  GlobeIcon,
  KeyRoundIcon,
  LockIcon,
  type LucideIcon,
  MoreHorizontalIcon,
} from 'lucide-react'
import type * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RelativeTime } from '@/components/ui/relative-time'
import { UmlDiagram } from '@/components/ui/uml-diagram'
import { useCoreloomI18n } from '@/lib/i18n'
import { AppLink } from '@/lib/link'
import type { UmlSpec } from '@/lib/uml'
import { cn } from '@/lib/utils'

/** Who can open a document: its owner, anyone with the link, or the link and a code. */
type DiagramVisibility = 'private' | 'public' | 'protected'

/** One entry of the card's "…" menu (open, duplicate, share, delete…). */
interface DiagramCardAction {
  label: string
  icon?: React.ReactNode
  onSelect: () => void
  /** Drawn in the destructive colour (Delete). */
  destructive?: boolean
  disabled?: boolean
}

interface DiagramCardProps {
  title: string
  /** Where the card goes; through the app's router with CoreloomLinkProvider. */
  href: string
  /** Drawn small as the thumbnail. */
  diagram?: UmlSpec
  /** A thumbnail the app already made (a URL); used when there's no `diagram`. */
  image?: string
  visibility: DiagramVisibility
  updatedAt: Date
  /** How many diagrams (views) the document holds. */
  diagramCount?: number
  /** The "…" menu; no menu when empty. */
  actions?: readonly DiagramCardAction[]
  className?: string
}

const VISIBILITY_ICONS: Record<DiagramVisibility, LucideIcon> = {
  private: LockIcon,
  public: GlobeIcon,
  protected: KeyRoundIcon,
}

/** A neutral drawing for a document with nothing to show yet: two boxes and a line. */
function EmptyIllustration() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 72"
      className="h-16 w-28 fill-none stroke-border-strong [stroke-width:1.5]"
    >
      <rect x="8" y="8" width="40" height="24" rx="3" className="fill-card" />
      <rect x="72" y="40" width="40" height="24" rx="3" className="fill-card" />
      <path d="M48 20h12v32h12" strokeDasharray="3 3" />
    </svg>
  )
}

function Thumbnail({ diagram, image }: { diagram?: UmlSpec; image?: string }) {
  if (diagram)
    return (
      <UmlDiagram
        diagram={diagram}
        preview
        height="100%"
        className="h-full rounded-none border-0 bg-transparent"
      />
    )
  if (image)
    return <img src={image} alt="" className="h-full w-full object-contain" loading="lazy" />
  return (
    <div className="grid h-full place-items-center">
      <EmptyIllustration />
    </div>
  )
}

function ActionsMenu({ title, actions }: { title: string; actions: readonly DiagramCardAction[] }) {
  const t = useCoreloomI18n().messages.diagramCard
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t.actions(title)}
          // Above the link that covers the card, so it opens the menu and not the document.
          className="relative z-10 shrink-0"
        >
          <MoreHorizontalIcon aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            variant={action.destructive ? 'destructive' : 'default'}
            disabled={action.disabled ?? false}
            onSelect={action.onSelect}
          >
            {action.icon}
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function DiagramCard({
  title,
  href,
  diagram,
  image,
  visibility,
  updatedAt,
  diagramCount,
  actions = [],
  className,
}: DiagramCardProps) {
  const t = useCoreloomI18n().messages.diagramCard
  const Icon = VISIBILITY_ICONS[visibility]
  return (
    <article
      data-slot="diagram-card"
      aria-label={title}
      className={cn(
        'group/card relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors duration-fast focus-within:border-border-strong hover:border-border-strong',
        className,
      )}
    >
      {/* The thumbnail is decoration: the title names the card. */}
      <div
        aria-hidden
        className="aspect-[16/10] min-h-0 overflow-hidden border-b border-border-subtle bg-inset"
      >
        <Thumbnail {...(diagram ? { diagram } : {})} {...(image ? { image } : {})} />
      </div>
      <div className="flex min-w-0 items-start gap-2 p-3">
        <div className="grid min-w-0 flex-1 gap-1.5">
          <p className="truncate text-[14px] font-semibold text-foreground">
            <AppLink
              href={href}
              // The link covers the whole card; its ring is drawn on the card.
              className="rounded-sm outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring"
            >
              {title}
            </AppLink>
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
            <Badge variant="secondary">
              <Icon aria-hidden />
              {t.visibility[visibility]}
            </Badge>
            {diagramCount !== undefined && <span>{t.diagrams(diagramCount)}</span>}
            <span className="min-w-0 truncate">
              {t.updated} <RelativeTime date={updatedAt} />
            </span>
          </div>
        </div>
        {actions.length > 0 && <ActionsMenu title={title} actions={actions} />}
      </div>
    </article>
  )
}

export { DiagramCard, type DiagramCardAction, type DiagramCardProps, type DiagramVisibility }
