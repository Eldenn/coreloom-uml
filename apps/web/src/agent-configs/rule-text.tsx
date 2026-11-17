// How a ready-made rule reads on a screen: its text with the catalog's code marks, the words of a
// search marked in it, and the badge of a rule that also produces a generated file.
import { FileCogIcon } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Highlight } from '@/components/ui/highlight'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useT } from '@/lib/locale'

/** `code` and **strong**, the only marks the catalog's texts use. */
const MARKS = /(`[^`]+`|\*\*[^*]+\*\*)/

/**
 * A catalog text (label, rule name, line). Rendered here rather than through `Markdown`: the
 * catalog shows hundreds of them at once, and the words of a search are marked inside the code too.
 */
export function RuleText({ text, terms = [] }: { text: string; terms?: readonly string[] }) {
  return text.split(MARKS).map((part, index) => {
    // The same text can come twice in a line, and the parts never move.
    const key = `${String(index)}:${part}`
    if (part.startsWith('`') && part.length > 2)
      return (
        <code
          key={key}
          className="rounded-[5px] bg-secondary px-1.5 py-0.5 font-mono text-[0.88em] text-foreground"
        >
          <Highlight text={part.slice(1, -1)} query={terms} />
        </code>
      )
    if (part.startsWith('**') && part.length > 4)
      return (
        <strong key={key} className="font-semibold">
          <Highlight text={part.slice(2, -2)} query={terms} />
        </strong>
      )
    return part ? <Highlight key={key} text={part} query={terms} /> : null
  })
}

/** "Applied", in words. `explained` adds what it means, on hover, focus and touch. */
export function AppliedBadge({ explained = false }: { explained?: boolean }) {
  const t = useT()
  const badge = (
    <Badge variant="default" className="shrink-0">
      <FileCogIcon aria-hidden /> {t.agents.ready.applied}
    </Badge>
  )
  if (!explained) return badge
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 cursor-help rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
          aria-label={`${t.agents.ready.applied}: ${t.agents.ready.appliedHint}`}
        >
          {badge}
        </button>
      </TooltipTrigger>
      <TooltipContent>{t.agents.ready.appliedHint}</TooltipContent>
    </Tooltip>
  )
}
