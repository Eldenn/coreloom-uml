'use client'

// Coreloom UI — Text effects. Four ways to bring a line of text to life, for hero titles, empty
// states and "thinking" labels:
// - WordReveal: the words arrive one after the other (a rise, a blur or a fade), once.
// - Typewriter: the text is typed out, with a caret; with several phrases it can type, erase and
//   move on to the next.
// - ShimmerText: a light sweeps across the text, for something in progress ("Thinking…").
// - GradientText: the text filled with the accent gradient, still or slowly moving.
// - ScrambleText: the letters flicker through random characters and settle on the text, left to
//   right, for a code name, a figure or a heading that "decodes".
// Screen readers always get the whole text once, never letter by letter. For people who ask for
// reduced motion the text is simply there.
//
//   <WordReveal text="Ship interfaces your users trust" className="font-display text-5xl" />
//   <Typewriter text={['dashboards', 'agents', 'docs']} loop />
//   <ShimmerText>Thinking…</ShimmerText>
import * as React from 'react'

import { useInView, useReducedMotion } from '@/components/ui/reveal'
import { cn } from '@/lib/utils'

const wordEffects = {
  up: { '--word-y': '0.4em' },
  blur: { '--word-y': '0', '--word-blur': '8px' },
  fade: { '--word-y': '0' },
} as const

function WordReveal({
  text,
  as: Tag = 'span',
  effect = 'up',
  step = 60,
  delay = 0,
  trigger = 'in-view',
  className,
  ...props
}: {
  /** The text; it is split on spaces. */
  text: string
  /** The element it renders: span (default), p, or a heading level you own. */
  as?: 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'div'
  /** up: each word rises into place; blur: each word comes into focus; fade. */
  effect?: keyof typeof wordEffects
  /** Milliseconds between one word and the next. */
  step?: number
  /** Milliseconds before the first word. */
  delay?: number
  /** Play when it scrolls into view (default), or as soon as it is mounted. */
  trigger?: 'in-view' | 'mount'
} & Omit<React.HTMLAttributes<HTMLElement>, 'children'>) {
  const ref = React.useRef<HTMLElement>(null)
  const inView = useInView(ref)
  const play = trigger === 'mount' || inView
  const words = text.split(/\s+/).filter(Boolean)
  return (
    <Tag
      ref={ref as React.Ref<never>}
      data-slot="word-reveal"
      data-state={play ? 'visible' : 'hidden'}
      className={className}
      {...props}
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden style={wordEffects[effect] as React.CSSProperties}>
        {words.map((word, i) => (
          // eslint-disable-next-line @eslint-react/no-array-index-key -- words of a fixed text; the same word may repeat.
          <React.Fragment key={i}>
            {i > 0 && ' '}
            <span
              className={cn('inline-block', play ? 'animate-word-in' : 'opacity-0')}
              style={play ? { animationDelay: `${delay + i * step}ms` } : undefined}
            >
              {word}
            </span>
          </React.Fragment>
        ))}
      </span>
    </Tag>
  )
}

function Typewriter({
  text,
  speed = 45,
  eraseSpeed = 25,
  hold = 1600,
  loop = false,
  caret = true,
  frozen = false,
  onDone,
  className,
  ...props
}: {
  /** One phrase, or several typed one after the other. */
  text: string | string[]
  /** Milliseconds per character typed. */
  speed?: number
  /** Milliseconds per character erased, between two phrases. */
  eraseSpeed?: number
  /** Milliseconds a phrase stays before it is erased. */
  hold?: number
  /** Start again from the first phrase after the last one (it never ends: keep it to one per page). */
  loop?: boolean
  /** Shows a blinking caret after the text. */
  caret?: boolean
  /** Shows the first phrase whole, without typing (previews, tests, a paused page). */
  frozen?: boolean
  /** Called when the last phrase is typed (not with loop). */
  onDone?: () => void
} & Omit<React.ComponentProps<'span'>, 'children'>) {
  // The phrases as one string: a new array with the same phrases doesn't restart the typing.
  const key = (Array.isArray(text) ? text : [text]).join('\u0000')
  const phrases = key.split('\u0000')
  const [state, setState] = React.useState({ index: 0, length: 0, key })
  // A new text starts over (state reset during render, React's pattern for derived state).
  if (state.key !== key) setState({ index: 0, length: 0, key })
  const onDoneRef = React.useRef(onDone)
  React.useEffect(() => {
    onDoneRef.current = onDone
  })
  const reduced = useReducedMotion()
  const still = frozen || reduced

  React.useEffect(() => {
    if (still) return
    const list = key.split('\u0000')
    let index = 0
    let length = 0
    let erasing = false
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const phrase = list[index] ?? ''
      if (!erasing && length < phrase.length) {
        length += 1
        timer = setTimeout(tick, speed)
      } else if (!erasing) {
        const last = index === list.length - 1
        if (last && !loop) {
          onDoneRef.current?.()
          return
        }
        erasing = true
        timer = setTimeout(tick, hold)
        return
      } else if (length > 0) {
        length -= 1
        timer = setTimeout(tick, eraseSpeed)
      } else {
        erasing = false
        index = (index + 1) % list.length
        timer = setTimeout(tick, speed * 4)
      }
      setState({ index, length, key })
    }
    timer = setTimeout(tick, speed)
    return () => {
      clearTimeout(timer)
    }
  }, [still, key, speed, eraseSpeed, hold, loop])

  const phrase = phrases[state.index] ?? ''
  const shown = still ? (phrases[0] ?? '') : phrase.slice(0, state.length)
  return (
    <span data-slot="typewriter" className={cn('whitespace-pre-wrap', className)} {...props}>
      <span className="sr-only">{phrases.join(', ')}</span>
      <span aria-hidden>
        {shown}
        {caret && (
          <span className="ml-px inline-block h-[1em] w-[2px] translate-y-[0.12em] animate-caret-blink bg-current align-baseline" />
        )}
      </span>
    </span>
  )
}

function ShimmerText({
  duration = 2,
  className,
  style,
  ...props
}: {
  /** Seconds for one sweep. */
  duration?: number
} & React.ComponentProps<'span'>) {
  // A mask, not a transparent fill: the text keeps its real color, so contrast checks and
  // high-contrast modes read it as ordinary text.
  return (
    <span
      data-slot="shimmer-text"
      className={cn(
        'inline-block animate-shimmer [mask-image:linear-gradient(90deg,rgb(0_0_0/0.6)_0%,rgb(0_0_0/0.6)_35%,#000_50%,rgb(0_0_0/0.6)_65%,rgb(0_0_0/0.6)_100%)] [mask-size:300%_100%] motion-reduce:animate-none motion-reduce:[mask-image:none]',
        className,
      )}
      style={{ '--shimmer-duration': `${duration}s`, ...style } as React.CSSProperties}
      {...props}
    />
  )
}

function GradientText({
  animate = false,
  duration = 6,
  className,
  style,
  ...props
}: {
  /** Slowly moves the gradient back and forth (decorative: one per view at most). */
  animate?: boolean
  /** Seconds for one back-and-forth. */
  duration?: number
} & React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="gradient-text"
      className={cn(
        'bg-[linear-gradient(100deg,var(--color-primary-text),var(--color-chart-2),var(--color-chart-4),var(--color-primary-text))] [box-decoration-break:clone] [background-size:300%_100%] bg-clip-text text-primary-text [-webkit-text-fill-color:transparent]',
        animate && 'animate-gradient-pan motion-reduce:animate-none',
        className,
      )}
      style={{ '--gradient-duration': `${duration}s`, ...style } as React.CSSProperties}
      {...props}
    />
  )
}

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/'

/** The text as it looks after `progress` (0 to 1): settled letters, then scrambled ones. */
function scrambleFrame(text: string, progress: number, tick: number) {
  const settled = Math.floor(text.length * progress)
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i)
    if (i < settled || char === ' ') out += char
    // A cheap, repeatable shuffle: the same tick always shows the same letters.
    else out += GLYPHS.charAt((i * 7 + tick * 13) % GLYPHS.length)
  }
  return out
}

function ScrambleText({
  text,
  duration = 900,
  trigger = 'in-view',
  className,
  ...props
}: {
  /** The text it settles on. */
  text: string
  /** Milliseconds until every letter has settled. */
  duration?: number
  /** Play when it scrolls into view (default), or as soon as it is mounted. */
  trigger?: 'in-view' | 'mount'
} & Omit<React.ComponentProps<'span'>, 'children'>) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const inView = useInView(ref)
  const reduced = useReducedMotion()
  const play = !reduced && (trigger === 'mount' || inView)
  const [frame, setFrame] = React.useState<{ text: string; shown: string | null }>({
    text,
    shown: null,
  })
  if (frame.text !== text) setFrame({ text, shown: null })
  React.useEffect(() => {
    if (!play) return
    const start = performance.now()
    let tick = 0
    let raf = 0
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      tick += 1
      setFrame({ text, shown: progress >= 1 ? null : scrambleFrame(text, progress, tick) })
      if (progress < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [play, text, duration])
  return (
    <span ref={ref} data-slot="scramble-text" className={cn('tabular-nums', className)} {...props}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>{frame.shown ?? text}</span>
    </span>
  )
}

export { GradientText, scrambleFrame, ScrambleText, ShimmerText, Typewriter, WordReveal }
