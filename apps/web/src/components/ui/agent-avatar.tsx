'use client'

// Coreloom UI — AgentAvatar. A small animated face for an AI agent: it breathes, blinks and glances
// around while it waits, looks up with a glowing halo while it thinks, talks while it answers,
// opens its eyes wide while it listens, smiles when it is done, frowns on an error and dozes when
// offline. `variant="dots"` is the quieter version: three dots that breathe, wave and bounce. Give
// each agent a `seed` (its id or name) and it keeps the same colour, eyes and rhythm everywhere, so
// the members of a team are told apart at a glance and never blink in step. `shape` gives it another
// outline (circle, hexagon, diamond, shield, blob), or `shape="seed"` lets the seed pick one. The state
// is said in words to screen readers; the motion stops for people who ask for reduced motion.
//
//   <AgentAvatar name="Researcher" seed="researcher" state="thinking" />
//   <AgentAvatar variant="dots" state={status === 'streaming' ? 'speaking' : 'idle'} decorative />
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type AgentAvatarState =
  'idle' | 'thinking' | 'speaking' | 'listening' | 'done' | 'error' | 'offline'
type AgentAvatarVariant = 'face' | 'dots'
type AgentAvatarTone = 'primary' | 'neutral' | 'teal' | 'violet' | 'orange' | 'blue' | 'pink'
type AgentAvatarEyes = 'round' | 'tall' | 'square'
type AgentAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
type AgentAvatarShape = 'square' | 'circle' | 'hexagon' | 'diamond' | 'shield' | 'blob'

/**
 * The tones a seed picks from: chart colours, distinct from one another in both themes. Pink is
 * left out so that a seeded agent never looks like one in error.
 */
const SEED_TONES = ['teal', 'violet', 'orange', 'blue'] as const
const SEED_EYES = ['round', 'tall', 'square'] as const
const SEED_SHAPES = ['square', 'circle', 'hexagon', 'diamond', 'shield', 'blob'] as const

/** A well-spread 32-bit hash of a seed: FNV-1a over its UTF-16 units, then a final mix. */
function seedHash(seed: string) {
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  // The final mix spreads close seeds ("agent-1", "agent-2") over different looks.
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xc2b2ae35)
  hash ^= hash >>> 16
  return hash >>> 0
}

/**
 * The colour, eyes, shape and rhythm an agent gets from its seed (an id or a name): the same seed
 * always gives the same look, so an agent is recognisable wherever it appears. `phase` (ms) is where
 * its idle loops start, so that a team doesn't blink in step. `shape` is used with `shape="seed"`.
 */
function agentAvatarLook(seed: string): {
  tone: AgentAvatarTone
  eyes: AgentAvatarEyes
  shape: AgentAvatarShape
  phase: number
} {
  const hash = seedHash(seed)
  return {
    tone: SEED_TONES[hash % SEED_TONES.length] ?? 'teal',
    eyes: SEED_EYES[(hash >>> 8) % SEED_EYES.length] ?? 'round',
    shape: SEED_SHAPES[(hash >>> 24) % SEED_SHAPES.length] ?? 'square',
    phase: (hash >>> 12) % 5000,
  }
}

const TONES: Record<AgentAvatarTone | 'danger' | 'muted', string> = {
  primary: 'border-primary/30 bg-primary-subtle text-primary-text',
  neutral: 'border-border bg-secondary text-fg-secondary',
  teal: 'border-chart-1/35 bg-chart-1/15 text-chart-1',
  violet: 'border-chart-2/35 bg-chart-2/15 text-chart-2',
  orange: 'border-chart-3/35 bg-chart-3/15 text-chart-3',
  blue: 'border-chart-4/35 bg-chart-4/15 text-chart-4',
  pink: 'border-chart-5/35 bg-chart-5/15 text-chart-5',
  danger: 'border-destructive/40 bg-destructive-subtle text-destructive',
  muted: 'border-border-subtle bg-inset text-muted-foreground',
}

// The same tones for a drawn outline (hexagon, diamond, shield, blob).
const FILLS: Record<keyof typeof TONES, string> = {
  primary: 'fill-primary-subtle stroke-primary/30',
  neutral: 'fill-secondary stroke-border',
  teal: 'fill-chart-1/15 stroke-chart-1/35',
  violet: 'fill-chart-2/15 stroke-chart-2/35',
  orange: 'fill-chart-3/15 stroke-chart-3/35',
  blue: 'fill-chart-4/15 stroke-chart-4/35',
  pink: 'fill-chart-5/15 stroke-chart-5/35',
  danger: 'fill-destructive-subtle stroke-destructive/40',
  muted: 'fill-inset stroke-border-subtle',
}

/** A closed path through `points` (in the 32 × 32 box) with each corner rounded by `r`. */
function roundedPolygon(points: [number, number][], r: number) {
  const n = points.length
  const toward = (from: [number, number], to: [number, number]) => {
    const [dx, dy] = [to[0] - from[0], to[1] - from[1]]
    const k = r / Math.hypot(dx, dy)
    return `${(from[0] + dx * k).toFixed(2)} ${(from[1] + dy * k).toFixed(2)}`
  }
  return (
    points
      .map((p, i) => {
        const prev = points[(i + n - 1) % n] ?? p
        const next = points[(i + 1) % n] ?? p
        return `${i === 0 ? 'M' : 'L'}${toward(p, prev)} Q${String(p[0])} ${String(p[1])} ${toward(p, next)}`
      })
      .join(' ') + 'Z'
  )
}

/** The outlines drawn in SVG; square and circle stay a CSS box. Each fits the 32 × 32 box, half a unit in. */
const OUTLINES: Record<Exclude<AgentAvatarShape, 'square' | 'circle'>, string> = {
  hexagon: roundedPolygon(
    [
      [16, 0.5],
      [29.9, 8.5],
      [29.9, 23.5],
      [16, 31.5],
      [2.1, 23.5],
      [2.1, 8.5],
    ],
    3.2,
  ),
  diamond: roundedPolygon(
    [
      [16, 0.5],
      [31.5, 16],
      [16, 31.5],
      [0.5, 16],
    ],
    4,
  ),
  shield:
    'M5 1.5 H27 Q30.5 1.5 30.5 5 V14.5 Q30.5 25.5 16 31.5 Q1.5 25.5 1.5 14.5 V5 Q1.5 1.5 5 1.5Z',
  blob: 'M16.5 1.5 C25 1.3 30.7 7 30.5 15 C30.3 23.5 25.5 30.6 16 30.5 C6.8 30.4 1.4 24.6 1.5 16.5 C1.6 7.6 8.2 1.7 16.5 1.5Z',
}

const SIZES: Record<AgentAvatarSize, string> = {
  xs: 'size-4 rounded-[5px]',
  sm: 'size-6 rounded-[7px]',
  md: 'size-8 rounded-[9px]',
  lg: 'size-10 rounded-[11px]',
  xl: 'size-14 rounded-[15px]',
}

// SVG parts move around their own centre.
const own = '[transform-box:fill-box] origin-center motion-reduce:animate-none'
// Idle loops start at the agent's own point in the cycle (a negative delay: already under way).
const phased = '[animation-delay:calc(var(--agent-phase,0ms)*-1)]'

/** One eye, open, centred on (cx, cy) of the 32 × 32 face. */
function Eye({
  shape,
  cx,
  cy,
  scale = 1,
  className,
}: {
  shape: AgentAvatarEyes
  cx: number
  cy: number
  scale?: number
  className?: string
}) {
  if (shape === 'round') return <circle cx={cx} cy={cy} r={3.4 * scale} className={className} />
  const [w, h, r] = (shape === 'tall' ? [4.2, 8.6, 2.1] : [6, 6, 1.6]).map((n) => n * scale) as [
    number,
    number,
    number,
  ]
  return <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={r} className={className} />
}

const line = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** A four-pointed spark, centred on (cx, cy). */
function Spark({
  cx,
  cy,
  r,
  className,
}: {
  cx: number
  cy: number
  r: number
  className?: string
}) {
  const k = r * 0.28
  return (
    <path
      d={`M${String(cx)} ${String(cy - r)} Q${String(cx + k)} ${String(cy - k)} ${String(cx + r)} ${String(cy)} Q${String(cx + k)} ${String(cy + k)} ${String(cx)} ${String(cy + r)} Q${String(cx - k)} ${String(cy + k)} ${String(cx - r)} ${String(cy)} Q${String(cx - k)} ${String(cy - k)} ${String(cx)} ${String(cy - r)}Z`}
      className={className}
    />
  )
}

function Face({ state, eyes }: { state: AgentAvatarState; eyes: AgentAvatarEyes }) {
  if (state === 'done')
    return (
      <>
        <g {...line}>
          <path d="M8.5 16.5 Q11 12.5 13.5 16.5" />
          <path d="M18.5 16.5 Q21 12.5 23.5 16.5" />
        </g>
        {/* Cheeks, and a spark that pops out once. */}
        <ellipse cx={7.5} cy={20.5} rx={2.2} ry={1.3} opacity={0.35} />
        <ellipse cx={24.5} cy={20.5} rx={2.2} ry={1.3} opacity={0.35} />
        <Spark cx={26} cy={6.5} r={3} className={cn(own, 'animate-agent-sparkle')} />
      </>
    )
  if (state === 'error')
    return (
      <g {...line}>
        <path d="M9 12.5 13 16.5 M13 12.5 9 16.5" />
        <path d="M19 12.5 23 16.5 M23 12.5 19 16.5" />
        <path d="M13 22.5 Q16 20.5 19 22.5" />
      </g>
    )
  if (state === 'offline')
    return (
      <>
        <g {...line}>
          <path d="M8.5 16 Q11 17.5 13.5 16" />
          <path d="M18.5 16 Q21 17.5 23.5 16" />
        </g>
        <path
          d="M22.5 5.5 H26 L22.5 9.5 H26"
          {...line}
          strokeWidth={1.4}
          className={cn(own, 'animate-agent-snooze')}
        />
      </>
    )
  if (state === 'thinking')
    return (
      <>
        <g className={cn(own, 'animate-agent-scan')}>
          <Eye shape={eyes} cx={11} cy={13} />
          <Eye shape={eyes} cx={21} cy={13} />
        </g>
        <Spark cx={26} cy={6} r={2.4} className={cn(own, 'animate-agent-twinkle')} />
      </>
    )
  if (state === 'speaking')
    return (
      <>
        <g className={cn(own, 'animate-agent-hop')}>
          <Eye shape={eyes} cx={11} cy={14} />
          <Eye shape={eyes} cx={21} cy={14} />
        </g>
        <rect
          x={13}
          y={21.2}
          width={6}
          height={1.6}
          rx={0.8}
          className={cn(own, 'animate-agent-talk')}
        />
      </>
    )
  if (state === 'listening')
    return (
      <>
        <Eye shape={eyes} cx={11} cy={15} scale={1.18} />
        <Eye shape={eyes} cx={21} cy={15} scale={1.18} />
        {/* Sound coming in from the side. */}
        <g {...line} strokeWidth={1.4}>
          <path d="M26 13 Q27.4 15 26 17" className={cn(own, 'animate-agent-ripple')} />
          <path
            d="M28 11.5 Q30.2 15 28 18.5"
            className={cn(own, 'animate-agent-ripple [animation-delay:300ms]')}
          />
        </g>
      </>
    )
  // Idle: breathing, a glance aside now and then, and blinks, each agent on its own beat. Hovering
  // the avatar makes it squint, pleased.
  return (
    <g className={cn(own, phased, 'animate-agent-breathe')}>
      <g className={cn(own, phased, 'animate-agent-glance')}>
        <g
          className={cn(
            own,
            'transition-transform duration-200 group-hover/agent-avatar:scale-y-[0.55]',
          )}
        >
          <Eye shape={eyes} cx={11} cy={15} className={cn(own, phased, 'animate-agent-blink')} />
          <Eye shape={eyes} cx={21} cy={15} className={cn(own, phased, 'animate-agent-blink')} />
        </g>
      </g>
    </g>
  )
}

function Dots({ state }: { state: AgentAvatarState }) {
  // A smile when it is done, smaller dots when offline, a row otherwise.
  const ys = state === 'done' ? [14.5, 17.5, 14.5] : [16, 16, 16]
  const r = state === 'offline' ? 1.6 : 2.2
  const motion = {
    idle: 'animate-agent-dot-breathe',
    thinking: 'animate-agent-wave',
    speaking: 'animate-agent-eq',
    listening: 'animate-agent-dot-listen',
    done: '',
    error: '',
    offline: '',
  }[state]
  // Speaking dots run at slightly different speeds, so the bounce never settles into a pattern.
  const speeds = ['0.8s', '0.65s', '0.95s']
  return (
    <>
      {[10, 16, 22].map((cx, i) => (
        <rect
          key={cx}
          x={cx - r}
          y={(ys[i] ?? 16) - r}
          width={r * 2}
          height={r * 2}
          rx={r}
          className={cn(own, motion)}
          style={
            motion
              ? {
                  animationDelay:
                    state === 'idle'
                      ? `calc(var(--agent-phase, 0ms) * -1 + ${String(i * 400)}ms)`
                      : `${String(i * 150)}ms`,
                  animationDuration: state === 'speaking' ? speeds[i] : undefined,
                }
              : undefined
          }
        />
      ))}
    </>
  )
}

// error turns red and offline grey, whatever the tone.
const STATE_COLOURS: Partial<Record<AgentAvatarState, 'danger' | 'muted'>> = {
  error: 'danger',
  offline: 'muted',
}
const SHELL_MOTIONS: Partial<Record<AgentAvatarState, string>> = {
  error: 'animate-agent-shake',
  done: 'animate-agent-pop',
}
const HALO_MOTIONS: Partial<Record<AgentAvatarState, string>> = {
  thinking: 'animate-agent-halo',
  speaking: 'animate-agent-halo',
  listening: 'animate-agent-halo [animation-duration:2.6s]',
  error: 'animate-agent-flash',
}

function AgentAvatar({
  name,
  state = 'idle',
  variant = 'face',
  seed,
  tone,
  eyes,
  shape,
  size = 'md',
  animated = true,
  decorative = false,
  className,
  style,
  ...props
}: {
  /** The agent's name, said with its state to screen readers ("Researcher, thinking"). Default "AI agent". */
  name?: string
  /**
   * idle (breathes, blinks, glances), thinking (looks up, halo), speaking (talks, halo), listening
   * (wide eyes, sound waves), done (smiles), error (shakes), offline (dozes). Default idle.
   */
  state?: AgentAvatarState
  /** face: eyes on a rounded square; dots: three dots in a circle. Default face. */
  variant?: AgentAvatarVariant
  /**
   * The outline: square (rounded, the face's default), circle (the dots' default), hexagon,
   * diamond, shield or blob; `seed` lets the seed pick one, so each agent keeps its own.
   */
  shape?: AgentAvatarShape | 'seed'
  /** Picks a stable colour, eyes and rhythm for this agent (its id or name). Without it, the accent colour and round eyes. */
  seed?: string
  /** Overrides the seed's colour; `primary` follows the app's accent. */
  tone?: AgentAvatarTone
  /** Overrides the seed's eyes (face only). */
  eyes?: AgentAvatarEyes
  /** xs 16 px, sm 24, md 32 (default), lg 40, xl 56. */
  size?: AgentAvatarSize
  /** false: the face shows its state without moving (long lists, a print view). Default true. */
  animated?: boolean
  /** Hide it from screen readers when the name and state are already said next to it. */
  decorative?: boolean
} & Omit<React.ComponentProps<'span'>, 'children'>) {
  const t = useCoreloomI18n().messages.ai.agentAvatar
  const look = seed === undefined ? undefined : agentAvatarLook(seed)
  const eyeShape = eyes ?? look?.eyes ?? 'round'
  const outline: AgentAvatarShape =
    shape === 'seed'
      ? (look?.shape ?? 'square')
      : (shape ?? (variant === 'dots' ? 'circle' : 'square'))
  const drawn = outline === 'square' || outline === 'circle' ? undefined : OUTLINES[outline]
  const colour = STATE_COLOURS[state] ?? tone ?? look?.tone ?? 'primary'
  const shell = SHELL_MOTIONS[state] ?? ''
  const halo = HALO_MOTIONS[state] ?? ''
  return (
    <span
      data-slot="agent-avatar"
      data-state={state}
      data-variant={variant}
      data-shape={outline}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': t.label(name ?? t.agent, t.state[state]) })}
      className={cn(
        'group/agent-avatar relative inline-flex shrink-0 items-center justify-center border select-none motion-reduce:animate-none',
        SIZES[size],
        outline === 'circle' && 'rounded-full',
        TONES[colour],
        // A drawn outline takes the fill and the border instead of the box.
        drawn && 'border-transparent bg-transparent',
        shell,
        !animated && 'animate-none [&_*]:animate-none [&_*]:transition-none',
        className,
      )}
      style={
        {
          '--agent-phase': `${String(look?.phase ?? 0)}ms`,
          ...style,
        } as React.CSSProperties
      }
      {...props}
    >
      {drawn && (
        <svg
          viewBox="0 0 32 32"
          aria-hidden
          className="pointer-events-none absolute -inset-px size-[calc(100%+2px)] overflow-visible"
        >
          <path d={drawn} vectorEffect="non-scaling-stroke" className={FILLS[colour]} />
        </svg>
      )}
      {halo &&
        (drawn ? (
          <svg
            viewBox="0 0 32 32"
            aria-hidden
            className={cn(
              'pointer-events-none absolute -inset-px size-[calc(100%+2px)] overflow-visible opacity-0 motion-reduce:animate-none',
              halo,
            )}
          >
            <path
              d={drawn}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : (
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute -inset-px rounded-[inherit] border-2 border-current opacity-0 motion-reduce:animate-none',
              halo,
            )}
          />
        ))}
      {/* Keyed by state: each change plays a short bounce instead of a jump. */}
      <svg
        key={state}
        viewBox="0 0 32 32"
        fill="currentColor"
        aria-hidden
        className="relative size-full animate-agent-enter motion-reduce:animate-none"
      >
        {variant === 'dots' ? <Dots state={state} /> : <Face state={state} eyes={eyeShape} />}
      </svg>
    </span>
  )
}

export {
  AgentAvatar,
  type AgentAvatarEyes,
  agentAvatarLook,
  type AgentAvatarShape,
  type AgentAvatarSize,
  type AgentAvatarState,
  type AgentAvatarTone,
  type AgentAvatarVariant,
}
