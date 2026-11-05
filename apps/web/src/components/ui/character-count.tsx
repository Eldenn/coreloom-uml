import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** Characters as people count them: an emoji or an accented letter is one, not two. */
function countCharacters(text: string) {
  if (typeof Intl.Segmenter === 'function') {
    let n = 0
    for (const _ of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) n++
    return n
  }
  return Array.from(text).length
}

function CharacterCount({
  value,
  max,
  warnAt,
  id,
  className,
}: {
  /** The field's text (or its length). */
  value: string | number
  max: number
  /** Characters left from which it turns amber and starts announcing (default 10% of max, at least 10). */
  warnAt?: number
  id?: string
  className?: string
}) {
  const i18n = useCoreloomI18n()
  const t = i18n.messages.inputs.count
  const used = typeof value === 'number' ? value : countCharacters(value)
  const left = max - used
  const threshold = warnAt ?? Math.max(10, Math.round(max / 10))
  const state = left < 0 ? 'over' : left <= threshold ? 'near' : 'ok'

  // What the live region says: only when a threshold is crossed (near, 0 left, over), never per key.
  const [announced, setAnnounced] = React.useState('')
  const step = left < 0 ? 'over' : left === 0 ? 'zero' : left <= threshold ? 'near' : 'ok'
  const lastStep = React.useRef(step)
  React.useEffect(() => {
    if (step === lastStep.current) return
    lastStep.current = step
    setAnnounced(step === 'ok' ? '' : left < 0 ? t.over(-left) : t.left(left))
  }, [step, left, t])

  return (
    <p
      data-slot="character-count"
      data-state={state}
      className={cn(
        'm-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums data-[state=near]:text-warning data-[state=over]:font-semibold data-[state=over]:text-destructive',
        className,
      )}
    >
      <span aria-hidden>
        {i18n.formatNumber(used)}/{i18n.formatNumber(max)}
      </span>
      {/* Read with the field (aria-describedby). */}
      <span id={id} className="sr-only">
        {left < 0 ? t.over(-left) : t.used(used, max)}
      </span>
      <span role="status" className="sr-only">
        {announced}
      </span>
    </p>
  )
}

export { CharacterCount, countCharacters }
