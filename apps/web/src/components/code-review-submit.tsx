'use client'

// Coreloom UI — Code review, "Finish review". A popover to pick the verdict (comment, approve,
// request changes), write a summary and send it; it waits for the app and says when sending
// failed. Part of the CodeReview block.
import * as React from 'react'

import type { ReviewSubmission, ReviewVerdict } from '@/components/code-review-model'
import { Button } from '@/components/ui/button'
import { RadioCard, RadioCardGroup } from '@/components/ui/choice-card'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { useCoreloomI18n } from '@/lib/i18n'

const VERDICTS: ReviewVerdict[] = ['comment', 'approve', 'request-changes']

const isVerdict = (value: string): value is ReviewVerdict => (VERDICTS as string[]).includes(value)

/** Sending: idle, waiting for the app, or failed (the popover stays open to try again). */
type SendState = 'idle' | 'sending' | 'failed'

function FinishReview({
  onSubmit,
}: {
  onSubmit: (review: ReviewSubmission) => void | Promise<void>
}) {
  const t = useCoreloomI18n().messages.codeReview
  const id = React.useId()
  const [open, setOpen] = React.useState(false)
  const [verdict, setVerdict] = React.useState<ReviewVerdict>('comment')
  const [body, setBody] = React.useState('')
  const [state, setState] = React.useState<SendState>('idle')
  const verdictText = (v: ReviewVerdict) =>
    v === 'request-changes' ? t.verdicts.requestChanges : t.verdicts[v]

  const send = async () => {
    setState('sending')
    try {
      await onSubmit({ verdict, body: body.trim() })
      setState('idle')
      setBody('')
      setVerdict('comment')
      setOpen(false)
    } catch {
      setState('failed')
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (state === 'sending') return
        setOpen(next)
        if (!next) setState('idle')
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" size="sm">
          {t.finish}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))]">
        <form
          aria-labelledby={`${id}-title`}
          aria-busy={state === 'sending'}
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <p id={`${id}-title`} className="m-0 text-[14px] font-semibold text-foreground">
            {t.finish}
          </p>
          <RadioCardGroup
            aria-label={t.verdict}
            value={verdict}
            onValueChange={(value) => {
              if (isVerdict(value)) setVerdict(value)
            }}
            disabled={state === 'sending'}
          >
            {VERDICTS.map((v) => (
              <RadioCard
                key={v}
                value={v}
                title={verdictText(v).label}
                description={verdictText(v).description}
              />
            ))}
          </RadioCardGroup>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-summary`}>{t.summary}</Label>
            <Textarea
              id={`${id}-summary`}
              rows={3}
              value={body}
              placeholder={t.summaryPlaceholder}
              disabled={state === 'sending'}
              onChange={(e) => {
                setBody(e.target.value)
              }}
            />
          </div>
          {state === 'failed' ? (
            <p role="alert" className="m-0 text-[13px] text-destructive">
              {t.submitFailed}
            </p>
          ) : null}
          <Button type="submit" size="sm" className="self-end" disabled={state === 'sending'}>
            {state === 'sending' ? <Spinner aria-hidden className="text-current" /> : null}
            {state === 'sending' ? t.submitting : t.submit}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

export { FinishReview }
