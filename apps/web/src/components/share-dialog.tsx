'use client'

// Coreloom UI — ShareDialog. The window where someone decides who can open a document: only them,
// anyone with the link, or the link and a code. It shows the link to copy and the code (hidden
// until asked), and can make a new link or a new code. The app makes and checks links and codes;
// this block only shows them and calls back.
import {
  CopyIcon,
  GlobeIcon,
  KeyRoundIcon,
  LockIcon,
  type LucideIcon,
  RefreshCwIcon,
} from 'lucide-react'
import * as React from 'react'

import { CopyButton } from '@/components/copy-button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { RadioCard, RadioCardGroup } from '@/components/ui/choice-card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popconfirm } from '@/components/ui/popconfirm'
import { SecretValue } from '@/components/ui/secret-value'
import { toast } from '@/components/ui/sonner'
import { Spinner } from '@/components/ui/spinner'
import { type Messages, useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** Who can open the document: its owner, anyone with the link, or the link and a code. */
type ShareVisibility = 'private' | 'public' | 'protected'

interface ShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The document's name, in the dialog's title and in the copied message. */
  title: string
  visibility: ShareVisibility
  /** Applies a choice. The card spins until it settles; a rejection puts the old choice back. */
  onVisibilityChange: (visibility: ShareVisibility) => Promise<void>
  /** The share link, shown when the document is public or protected. */
  link?: string
  /** The access code, shown (hidden until asked) when the document is protected. */
  code?: string
  /** Makes a new link; the old one stops working. Asked first. */
  onRegenerateLink?: () => Promise<void>
  /** Makes a new code; people who entered the old one lose access. Asked first. */
  onRegenerateCode?: () => Promise<void>
  /** The app is busy (loading the sharing settings): the choices are off. */
  pending?: boolean
  /** A problem to show at the top, from the app. */
  error?: React.ReactNode
  className?: string
}

type ShareText = Messages['shareDialog']

const CHOICES: readonly { value: ShareVisibility; icon: LucideIcon }[] = [
  { value: 'private', icon: LockIcon },
  { value: 'public', icon: GlobeIcon },
  { value: 'protected', icon: KeyRoundIcon },
]

function isShareVisibility(value: string): value is ShareVisibility {
  return CHOICES.some((choice) => choice.value === value)
}

/** The choice on screen: the one being applied while the call runs, then the app's own. */
function useVisibilityChoice(
  visibility: ShareVisibility,
  apply: (visibility: ShareVisibility) => Promise<void>,
  fail: (failed: boolean) => void,
) {
  const [applying, setApplying] = React.useState<ShareVisibility | null>(null)
  const choose = async (next: ShareVisibility) => {
    // One change at a time; the radios stay focusable meanwhile, so focus is never lost.
    if (applying || next === visibility) return
    setApplying(next)
    fail(false)
    try {
      await apply(next)
    } catch {
      fail(true)
    } finally {
      setApplying(null)
    }
  }
  return { shown: applying ?? visibility, applying, choose }
}

/** A button that asks first, then runs `action`; a failure is reported, not thrown. */
function ConfirmedAction({
  label,
  title,
  description,
  confirmLabel,
  action,
  onFailed,
}: {
  label: string
  title: string
  description: string
  confirmLabel: string
  action: () => Promise<void>
  onFailed: () => void
}) {
  return (
    <Popconfirm
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      destructive
      onConfirm={async () => {
        try {
          await action()
        } catch {
          onFailed()
        }
      }}
    >
      <Button type="button" variant="ghost" size="sm" className="justify-self-start">
        <RefreshCwIcon aria-hidden />
        {label}
      </Button>
    </Popconfirm>
  )
}

function LinkField({
  link,
  t,
  onRegenerate,
  onFailed,
}: {
  link: string
  t: ShareText
  onRegenerate: (() => Promise<void>) | undefined
  onFailed: (message: string) => void
}) {
  const id = React.useId()
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id}>{t.link}</Label>
      <div className="flex min-w-0 items-center gap-1">
        <Input
          id={id}
          readOnly
          value={link}
          className="min-w-0 flex-1 font-mono text-[13px]"
          onFocus={(e) => {
            e.currentTarget.select()
          }}
        />
        <CopyButton value={link} label={t.copyLink} />
      </div>
      {onRegenerate && (
        <ConfirmedAction
          label={t.regenerateLink}
          title={t.regenerateLinkTitle}
          description={t.regenerateLinkDescription}
          confirmLabel={t.regenerate}
          action={onRegenerate}
          onFailed={() => {
            onFailed(t.regenerateLinkFailed)
          }}
        />
      )}
    </div>
  )
}

function CodeField({
  code,
  t,
  onRegenerate,
  onFailed,
}: {
  code: string
  t: ShareText
  onRegenerate: (() => Promise<void>) | undefined
  onFailed: (message: string) => void
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <p className="m-0 text-[13px] font-medium text-foreground">{t.code}</p>
      <SecretValue value={code} label={t.code} visibleEnd={0} className="w-full" />
      {onRegenerate && (
        <ConfirmedAction
          label={t.newCode}
          title={t.newCodeTitle}
          description={t.newCodeDescription}
          confirmLabel={t.generate}
          action={onRegenerate}
          onFailed={() => {
            onFailed(t.newCodeFailed)
          }}
        />
      )}
    </div>
  )
}

/** Copies a short message with the link and the code, ready to paste in a chat or an email. */
function CopyInvitation({ text, t }: { text: string; t: ShareText }) {
  const failed = useCoreloomI18n().messages.copy.failed
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t.copied)
    } catch {
      toast.error(failed)
    }
  }
  return (
    <Button
      type="button"
      variant="secondary"
      className="justify-self-start"
      onClick={() => {
        void copy()
      }}
    >
      <CopyIcon aria-hidden />
      {t.copyBoth}
    </Button>
  )
}

function Choices({
  shown,
  applying,
  disabled,
  onChoose,
  t,
}: {
  shown: ShareVisibility
  applying: ShareVisibility | null
  disabled: boolean
  onChoose: (visibility: ShareVisibility) => void
  t: ShareText
}) {
  return (
    <RadioCardGroup
      aria-label={t.who}
      value={shown}
      disabled={disabled}
      onValueChange={(value) => {
        if (isShareVisibility(value)) onChoose(value)
      }}
      className="gap-2"
    >
      {CHOICES.map(({ value, icon: Icon }) => (
        <RadioCard
          key={value}
          value={value}
          title={t.options[value].title}
          description={t.options[value].description}
          icon={applying === value ? <Spinner className="text-current" /> : <Icon />}
          className="py-3"
        />
      ))}
    </RadioCardGroup>
  )
}

function ShareDialog({
  open,
  onOpenChange,
  title,
  visibility,
  onVisibilityChange,
  link,
  code,
  onRegenerateLink,
  onRegenerateCode,
  pending = false,
  error,
  className,
}: ShareDialogProps) {
  const t = useCoreloomI18n().messages.shareDialog
  const [problem, setProblem] = React.useState<string | null>(null)
  const choice = useVisibilityChoice(visibility, onVisibilityChange, (failed) => {
    setProblem(failed ? t.changeFailed : null)
  })
  // The link and the code follow the settled choice, not the one still being applied.
  const shared = visibility !== 'private' && link !== undefined
  const coded = visibility === 'protected' && code !== undefined
  const shownError = error ?? problem
  // The app opens the dialog from its own button (no Trigger here): focus goes back to it.
  const opener = React.useRef<HTMLElement | null>(null)
  const content = React.useRef<HTMLDivElement>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-slot="share-dialog"
        className={cn('max-h-[calc(100svh-2rem)] overflow-y-auto', className)}
        ref={content}
        onOpenAutoFocus={(event) => {
          opener.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null
          // Start on the current choice, as a radio group does, not on the first card.
          const checked = content.current?.querySelector<HTMLElement>('input[type="radio"]:checked')
          if (!checked) return
          event.preventDefault()
          checked.focus()
        }}
        onCloseAutoFocus={(event) => {
          const target = opener.current
          if (!target?.isConnected) return
          event.preventDefault()
          target.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle className="pr-8 break-words">{t.title(title)}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        {shownError ? (
          <Alert variant="destructive">
            <AlertDescription>{shownError}</AlertDescription>
          </Alert>
        ) : null}
        <div aria-busy={choice.applying ? true : undefined} className="min-w-0">
          <Choices
            shown={choice.shown}
            applying={choice.applying}
            disabled={pending}
            onChoose={(next) => {
              void choice.choose(next)
            }}
            t={t}
          />
        </div>
        {shared && (
          <LinkField link={link} t={t} onRegenerate={onRegenerateLink} onFailed={setProblem} />
        )}
        {coded && (
          <CodeField code={code} t={t} onRegenerate={onRegenerateCode} onFailed={setProblem} />
        )}
        {shared && coded && <CopyInvitation text={t.message(title, link, code)} t={t} />}
      </DialogContent>
    </Dialog>
  )
}

export { ShareDialog, type ShareDialogProps, type ShareVisibility }
