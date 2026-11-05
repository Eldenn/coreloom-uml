'use client'

// Coreloom UI — Stepper. Where the user is in a multi-step flow: done steps get a check, the current
// one is highlighted and announced (aria-current="step"). With `onStepChange`, finished steps
// become buttons that go back to them.
import { CheckIcon } from 'lucide-react'
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface StepperStep {
  title: React.ReactNode
  description?: React.ReactNode
}

function Stepper({
  steps,
  current,
  onStepChange,
  orientation = 'horizontal',
  className,
  'aria-label': ariaLabel,
}: {
  steps: StepperStep[]
  /** Index of the current step (0-based). Steps before it count as done; `steps.length` means all done. */
  current: number
  /** Makes finished steps clickable, to go back to them. */
  onStepChange?: (index: number) => void
  orientation?: 'horizontal' | 'vertical'
  className?: string
  'aria-label'?: string
}) {
  const t = useCoreloomI18n().messages.stepper
  return (
    <nav
      aria-label={ariaLabel ?? t.label}
      data-slot="stepper"
      data-orientation={orientation}
      className={className}
    >
      <ol
        className={cn(
          'flex font-sans',
          orientation === 'horizontal' ? 'flex-row items-start' : 'flex-col',
        )}
      >
        {steps.map((step, i) => {
          const state = i < current ? 'complete' : i === current ? 'current' : 'upcoming'
          const last = i === steps.length - 1
          const clickable = state === 'complete' && !!onStepChange
          const body = (
            <>
              <span
                data-slot="stepper-indicator"
                className={cn(
                  'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border font-mono text-[13px] font-semibold transition-colors duration-base [&_svg]:size-4',
                  state === 'complete' && 'border-primary bg-primary text-primary-foreground',
                  state === 'current' &&
                    'border-primary bg-primary-subtle text-primary-text ring-[3px] ring-primary-subtle',
                  state === 'upcoming' && 'border-border-strong bg-inset text-muted-foreground',
                )}
              >
                {state === 'complete' ? <CheckIcon aria-hidden /> : i + 1}
              </span>
              <span
                className={cn(
                  'flex min-w-0 flex-col gap-0.5',
                  orientation === 'horizontal' ? 'items-center text-center' : 'pt-1',
                )}
              >
                <span
                  className={cn(
                    'text-[14px] leading-snug font-medium',
                    state === 'upcoming' ? 'text-muted-foreground' : 'text-foreground',
                  )}
                >
                  {step.title}
                </span>
                {step.description ? (
                  <span className="text-[13px] leading-snug text-muted-foreground">
                    {step.description}
                  </span>
                ) : null}
                <span className="sr-only">
                  {t.step(i + 1, steps.length)}
                  {state === 'complete'
                    ? `, ${t.completed}`
                    : state === 'current'
                      ? `, ${t.current}`
                      : ''}
                </span>
              </span>
            </>
          )
          const itemClass = cn(
            'group/step flex gap-3 rounded-md outline-none',
            orientation === 'horizontal'
              ? 'flex-col items-center px-2'
              : 'flex-row items-start py-1',
          )
          return (
            <li
              // eslint-disable-next-line @eslint-react/no-array-index-key -- the index is the step's number in a fixed sequence; steps have no id.
              key={i}
              data-state={state}
              aria-current={state === 'current' ? 'step' : undefined}
              className={cn(
                'relative flex',
                orientation === 'horizontal' ? 'flex-1 justify-center' : 'pb-6 last:pb-0',
              )}
            >
              {!last && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute bg-border',
                    orientation === 'horizontal'
                      ? 'top-4 left-[calc(50%+1.25rem)] h-px w-[calc(100%-2.5rem)]'
                      : 'top-10 bottom-1 left-4 w-px',
                    state === 'complete' && 'bg-primary',
                  )}
                />
              )}
              {clickable ? (
                <button
                  type="button"
                  onClick={() => {
                    onStepChange(i)
                  }}
                  className={cn(
                    itemClass,
                    'cursor-pointer focus-visible:ring-[3px] focus-visible:ring-ring [&:hover_[data-slot=stepper-indicator]]:bg-primary-hover',
                  )}
                >
                  {body}
                </button>
              ) : (
                <div className={itemClass}>{body}</div>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export { Stepper, type StepperStep }
