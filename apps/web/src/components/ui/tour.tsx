'use client'

// Coreloom UI — Tour. A guided tour: a few steps that each point at a part of the screen and say
// what it is for, for a first visit or a new feature. The step's target is lit up (the rest of
// the page dims) and a card beside it holds the title, the text, "Step 2 of 4", Back, Next and
// Skip. Escape ends the tour. A step without a target (or whose target isn't on the page) shows
// its card in the middle of the screen.
//
//   <Tour open={open} onOpenChange={setOpen} steps={[
//     { target: '#new-project', title: 'Start a project', content: 'Everything begins here.' },
//     { target: () => searchRef.current, title: 'Find anything', content: 'Press ⌘K anywhere.' },
//   ]} />
import { Popover as PopoverPrimitive } from 'radix-ui'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface TourStep {
  /** A CSS selector, or a function returning the element. Leave out for a centred card. */
  target?: string | (() => Element | null)
  title: React.ReactNode
  content?: React.ReactNode
  /** Where the card sits around the target. Default bottom. */
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
}

const resolve = (target: TourStep['target']) => {
  if (!target || typeof document === 'undefined') return null
  return typeof target === 'string' ? document.querySelector(target) : target()
}

/** The spotlight follows its element as the page scrolls or resizes. */
function useRect(element: Element | null) {
  const [rect, setRect] = React.useState<DOMRect | null>(null)
  React.useEffect(() => {
    if (!element) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no element, nothing to follow
      setRect(null)
      return
    }
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        setRect(element.getBoundingClientRect())
      })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(element)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
      observer?.disconnect()
    }
  }, [element])
  return rect
}

function Tour({
  steps,
  open,
  onOpenChange,
  step: stepProp,
  defaultStep = 0,
  onStepChange,
  onFinish,
  padding = 6,
}: {
  steps: TourStep[]
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The step shown, from 0 (controlled). */
  step?: number
  defaultStep?: number
  onStepChange?: (step: number) => void
  /** Done on the last step (Skip and Escape only close). */
  onFinish?: () => void
  /** Space between the target and the edge of its spotlight, in px. Default 6. */
  padding?: number
}) {
  const t = useCoreloomI18n().messages.display.tour
  const [inner, setInner] = React.useState(defaultStep)
  const index = Math.min(Math.max(stepProp ?? inner, 0), Math.max(steps.length - 1, 0))
  const current = steps.at(index)
  const titleId = React.useId()
  const titleRef = React.useRef<HTMLHeadingElement>(null)

  const [element, setElement] = React.useState<Element | null>(null)
  React.useEffect(() => {
    if (!open) return
    const el = resolve(current?.target)
    el?.scrollIntoView({ block: 'center', inline: 'nearest' })
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the target lives outside React
    setElement(el)
  }, [open, current])
  const rect = useRect(open ? element : null)

  // Closing gives the focus back to where it was before the tour.
  React.useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    return () => {
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [open])

  // Each new step moves the focus to its title, so a screen reader reads it out.
  React.useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      titleRef.current?.focus()
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [open, index])

  const go = (next: number) => {
    if (stepProp === undefined) setInner(next)
    onStepChange?.(next)
  }
  const close = () => {
    onOpenChange(false)
  }
  const isLast = index === steps.length - 1

  // The card's anchor: the target, or the middle of the screen.
  const anchor = React.useMemo(
    () => ({
      current: {
        getBoundingClientRect: () =>
          rect ??
          new DOMRect(
            typeof window === 'undefined' ? 0 : window.innerWidth / 2,
            typeof window === 'undefined' ? 0 : window.innerHeight / 2,
            0,
            0,
          ),
      },
    }),
    [rect],
  )

  if (!open || !current) return null
  const centred = !rect

  return (
    <PopoverPrimitive.Root open modal={false}>
      {/* The page dims around the target; clicks go through to the page. */}
      <div
        aria-hidden
        data-slot="tour-spotlight"
        className="pointer-events-none fixed z-(--z-modal) rounded-lg transition-[top,left,width,height] duration-base motion-reduce:transition-none"
        style={
          rect
            ? {
                top: rect.top - padding,
                left: rect.left - padding,
                width: rect.width + padding * 2,
                height: rect.height + padding * 2,
                boxShadow: '0 0 0 9999px var(--scrim)',
              }
            : { inset: 0, background: 'var(--scrim)' }
        }
      />
      <PopoverPrimitive.Anchor virtualRef={anchor} />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          data-slot="tour"
          aria-labelledby={titleId}
          aria-roledescription={t.label}
          side={centred ? 'bottom' : (current.side ?? 'bottom')}
          align={centred ? 'center' : (current.align ?? 'center')}
          sideOffset={centred ? 0 : padding + 8}
          collisionPadding={12}
          className={cn(
            'z-(--z-popover) flex w-80 max-w-[calc(100vw-24px)] flex-col gap-3 rounded-lg border border-border bg-popover p-4 font-sans text-[14px] leading-[1.55] text-fg-secondary shadow-xl outline-hidden',
            centred && '-translate-y-1/2',
          )}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
          }}
          onInteractOutside={(e) => {
            e.preventDefault()
          }}
          onEscapeKeyDown={close}
        >
          <p className="m-0 font-mono text-[11.5px] text-muted-foreground">
            {t.step(index + 1, steps.length)}
          </p>
          <h2
            ref={titleRef}
            id={titleId}
            tabIndex={-1}
            className="m-0 -mt-1.5 text-[15px] font-semibold text-foreground outline-none"
          >
            {current.title}
          </h2>
          {current.content ? <div className="text-[13.5px]">{current.content}</div> : null}
          <div className="mt-1 flex items-center gap-2">
            {isLast ? null : (
              <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={close}>
                {t.skip}
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              {index > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    go(index - 1)
                  }}
                >
                  {t.back}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (isLast) {
                    onFinish?.()
                    close()
                  } else go(index + 1)
                }}
              >
                {isLast ? t.done : t.next}
              </Button>
            </div>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

export { Tour, type TourStep }
