'use client'

// Coreloom UI — Popconfirm. A small confirmation next to the button that asked for it: "Delete
// this comment?" with Cancel and Delete. Lighter than an AlertDialog, for actions that matter but
// are easy to redo or limited to one item. The focus starts on Cancel; Escape or a click outside
// cancels. When `onConfirm` returns a promise, the confirm button waits for it.
//
//   <Popconfirm title="Delete this comment?" confirmLabel="Delete" destructive onConfirm={remove}>
//     <Button variant="ghost" size="icon-sm" aria-label="Delete"><TrashIcon /></Button>
//   </Popconfirm>
import { Popover as PopoverPrimitive } from 'radix-ui'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function Popconfirm({
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  side = 'top',
  align = 'center',
  icon,
  className,
  children,
}: {
  /** The question: "Delete this comment?" */
  title: React.ReactNode
  /** What happens, in a sentence, when it isn't obvious. */
  description?: React.ReactNode
  /** The confirm button: say the action ("Delete"), not "OK". "Confirm" by default. */
  confirmLabel?: React.ReactNode
  cancelLabel?: React.ReactNode
  /** A red confirm button, for deleting or removing. */
  destructive?: boolean
  /** Runs on confirm; when it returns a promise the button spins and the popover closes after. */
  onConfirm: () => unknown
  onCancel?: () => void
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  /** An icon before the title, such as a warning triangle. */
  icon?: React.ReactNode
  className?: string
  /** The trigger: one Button (or another focusable element). */
  children: React.ReactNode
}) {
  const t = useCoreloomI18n().messages.utility.popconfirm
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen)
  const [busy, setBusy] = React.useState(false)
  const open = openProp ?? uncontrolled
  const titleId = React.useId()
  const descriptionId = React.useId()
  const cancelRef = React.useRef<HTMLButtonElement>(null)
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setUncontrolled(next)
    onOpenChange?.(next)
  }

  const confirm = async () => {
    const result = onConfirm()
    if (result instanceof Promise) {
      setBusy(true)
      try {
        await result
        setOpen(false)
      } finally {
        setBusy(false)
      }
    } else {
      setOpen(false)
    }
  }

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        if (!next) onCancel?.()
        setOpen(next)
      }}
    >
      <PopoverPrimitive.Trigger asChild>{children}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          data-slot="popconfirm"
          role="alertdialog"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={8}
          onOpenAutoFocus={(e) => {
            // The safe choice first, as in an alert dialog.
            e.preventDefault()
            cancelRef.current?.focus()
          }}
          className={cn(
            'z-(--z-popover) w-max max-w-72 origin-(--radix-popover-content-transform-origin) rounded-md border border-border bg-popover p-3.5 font-sans text-[13.5px] leading-snug text-fg-secondary shadow-lg outline-hidden duration-fast data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            className,
          )}
        >
          <div className="flex gap-2.5">
            {icon ? (
              <span
                aria-hidden
                className={cn(
                  'mt-px flex shrink-0 [&_svg]:size-4',
                  destructive ? 'text-destructive' : 'text-warning',
                )}
              >
                {icon}
              </span>
            ) : null}
            <div className="flex min-w-0 flex-col gap-1">
              <p id={titleId} className="m-0 font-semibold text-foreground">
                {title}
              </p>
              {description ? (
                <p id={descriptionId} className="m-0">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              ref={cancelRef}
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                onCancel?.()
                setOpen(false)
              }}
            >
              {cancelLabel ?? t.cancel}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={destructive ? 'destructive' : 'default'}
              aria-busy={busy || undefined}
              disabled={busy}
              onClick={() => {
                void confirm()
              }}
            >
              {busy ? <Spinner /> : null}
              {confirmLabel ?? t.confirm}
            </Button>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

export { Popconfirm }
