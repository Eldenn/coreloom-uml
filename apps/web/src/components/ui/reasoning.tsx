'use client'

// Coreloom UI — Reasoning. A model's thinking, folded under one line: "Thinking…" while it streams
// (open, so people can follow), then "Thought for 6 s", closed. Takes an AI SDK reasoning part's
// text and state.
import { BrainIcon, ChevronRightIcon } from 'lucide-react'
import * as React from 'react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Spinner } from '@/components/ui/spinner'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function Reasoning({
  text,
  streaming = false,
  duration,
  defaultOpen,
  className,
}: {
  text: string
  /** The part's state is "streaming". */
  streaming?: boolean
  /** Seconds spent thinking. Measured from the stream when left out. */
  duration?: number
  /** Open at first. By default it opens while streaming and closes when done. */
  defaultOpen?: boolean
  className?: string
}) {
  const t = useCoreloomI18n().messages.ai.reasoning
  const [open, setOpen] = React.useState(defaultOpen ?? streaming)
  // eslint-disable-next-line react-hooks/purity -- only the first render's value is kept: when the stream started.
  const started = React.useRef<number | null>(streaming ? Date.now() : null)
  const [measured, setMeasured] = React.useState<number>()
  const wasStreaming = React.useRef(streaming)

  React.useEffect(() => {
    if (streaming && started.current === null) started.current = Date.now()
    if (wasStreaming.current && !streaming) {
      if (started.current !== null) setMeasured(Math.round((Date.now() - started.current) / 1000))
      // Done thinking: fold it away unless the reader opened it themselves.
      if (defaultOpen === undefined) setOpen(false)
    }
    wasStreaming.current = streaming
  }, [streaming, defaultOpen])

  const seconds = duration ?? measured
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-slot="reasoning"
      className={cn('text-[13.5px]', className)}
    >
      <CollapsibleTrigger className="group inline-flex cursor-pointer items-center gap-1.5 rounded-sm py-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring">
        {streaming ? (
          <Spinner className="size-3.5 text-current" aria-hidden role="presentation" />
        ) : (
          <BrainIcon className="size-3.5" aria-hidden />
        )}
        <span>{streaming ? t.thinking : t.thought(seconds ?? 0)}</span>
        <ChevronRightIcon
          className="size-3.5 transition-transform duration-base group-data-[state=open]:rotate-90"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 border-l-2 border-border-strong py-0.5 pl-3 leading-[1.6] whitespace-pre-wrap text-muted-foreground">
          {text}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export { Reasoning }
