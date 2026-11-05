import * as React from 'react'

import { useInView, useReducedMotion } from '@/components/ui/reveal'
import { AppLink } from '@/lib/link'
import { cn } from '@/lib/utils'

type LogoAnimation = 'none' | 'fade' | 'stagger' | 'draw' | 'assemble' | 'wipe' | 'shine' | 'pulse'
type LogoTrigger = 'mount' | 'in-view' | 'hover'

const SHAPES = 'path, rect, circle, ellipse, polygon, polyline, line'

/**
 * The parts of an SVG logo that animate one after the other: its top-level groups when it has
 * several (symbol, wordmark, tagline), otherwise its shapes.
 */
function logoParts(svg: SVGSVGElement, parts: 'auto' | 'groups' | 'shapes' = 'auto'): Element[] {
  const groups = Array.from(svg.children).filter((c) => c.tagName.toLowerCase() === 'g')
  if (parts === 'groups' || (parts === 'auto' && groups.length > 1)) return groups
  return Array.from(svg.querySelectorAll(SHAPES))
}

/** Where part `i` of `count` starts for the assemble effect: around the logo, the same every time. */
function assembleOffset(i: number, count: number) {
  const angle = (i / Math.max(1, count)) * Math.PI * 2 + 0.6
  return {
    x: Math.round(Math.cos(angle) * 40),
    y: Math.round(Math.sin(angle) * 40),
    r: (i % 2 ? 1 : -1) * 12,
  }
}

function Logo({
  label,
  href,
  src,
  srcLight,
  animation = 'none',
  trigger = 'mount',
  parts = 'auto',
  duration,
  tint = false,
  className,
  style,
  children,
  ...props
}: {
  /** The name screen readers say ("Atlas"); with `href`, also the link's name. Leave it out only
   *  when the name is written right next to the logo. */
  label?: string
  /** Links the logo (usually to "/"), through the app's link component. */
  href?: string
  /** An image file instead of an inline SVG (only the fade, wipe, shine and pulse animations). */
  src?: string
  /** The image for light grounds, when `src` is the one for dark grounds (the brand default). */
  srcLight?: string
  /** none, fade, stagger, draw, assemble, wipe, shine or pulse (loops). */
  animation?: LogoAnimation
  /** Plays on mount (default), when it scrolls into view, or on hover (and on focus of its link). */
  trigger?: LogoTrigger
  /** What animates one after the other: the SVG's top-level groups, its shapes, or auto. */
  parts?: 'auto' | 'groups' | 'shapes'
  /** Milliseconds for the whole entrance (default depends on the effect). */
  duration?: number
  /** Paints every shape in the current text colour, whatever colours the file has. */
  tint?: boolean
  /** An inline SVG logo. */
  children?: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLElement>, 'children'>) {
  const box = React.useRef<HTMLSpanElement>(null)
  const inView = useInView(box)
  const reduced = useReducedMotion()
  // A hover logo stays still until the first hover; later hovers restart it in place (replay).
  const [hovered, setHovered] = React.useState(false)
  const playing =
    animation !== 'none' &&
    !reduced &&
    (trigger === 'mount' || (trigger === 'in-view' && inView) || (trigger === 'hover' && hovered))
  const total = duration ?? (animation === 'draw' ? 1800 : animation === 'pulse' ? 2400 : 900)

  // Index the parts of an inline SVG, and measure outlines for the draw effect.
  React.useLayoutEffect(() => {
    const svg = box.current?.querySelector('svg')
    if (!svg) return
    const list = logoParts(svg, parts)
    list.forEach((part, i) => {
      const el = part as SVGElement
      el.dataset.logoPart = ''
      el.style.setProperty('--logo-i', String(i))
      el.style.setProperty('--logo-n', String(list.length))
      const offset = assembleOffset(i, list.length)
      el.style.setProperty('--logo-x', `${offset.x}%`)
      el.style.setProperty('--logo-y', `${offset.y}%`)
      el.style.setProperty('--logo-r', `${offset.r}deg`)
    })
    // The outline is drawn about a 300th of the logo's width thick, whatever its viewBox.
    const width = svg.viewBox.baseVal.width || svg.getBBox().width
    svg.style.setProperty('--logo-stroke', String(Math.max(1, width / 300)))
    svg.querySelectorAll<SVGGeometryElement>(SHAPES).forEach((shape) => {
      const length = typeof shape.getTotalLength === 'function' ? shape.getTotalLength() : 0
      shape.style.setProperty('--logo-len', String(Math.ceil(length)))
    })
  }, [parts, children])

  const name = label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true }
  const content = (
    <span
      ref={box}
      data-slot="logo"
      data-animation={playing ? animation : 'none'}
      data-tint={tint || undefined}
      className={cn(
        'inline-flex shrink-0 items-center [&_svg]:h-full [&_svg]:w-auto [&>img]:h-full [&>img]:w-auto',
        !href && className,
      )}
      style={
        { '--logo-duration': `${total}ms`, ...(href ? undefined : style) } as React.CSSProperties
      }
      {...(href ? null : props)}
      {...(href ? { 'aria-hidden': true } : name)}
    >
      {src ? (
        <>
          <img src={src} alt="" className={cn(srcLight && 'light:hidden')} />
          {srcLight && <img src={srcLight} alt="" className="hidden light:block" />}
        </>
      ) : (
        children
      )}
    </span>
  )
  // Replays on the same element: remounting it (a new key) would swap the node under the pointer
  // between mousedown and mouseup, and the first click on a linked logo would be lost.
  const replay = () => {
    if (trigger !== 'hover' || reduced) return
    if (!hovered) {
      setHovered(true)
      return
    }
    const el = box.current
    if (!el || animation === 'none') return
    // Dropping the effect for one style pass restarts every CSS animation under it.
    el.dataset.animation = 'none'
    void el.getBoundingClientRect()
    el.dataset.animation = animation
  }

  if (href) {
    return (
      <AppLink
        href={href}
        aria-label={label}
        data-slot="logo-link"
        className={cn(
          'inline-flex shrink-0 rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
          className,
        )}
        style={style}
        onPointerEnter={replay}
        onFocus={replay}
        {...props}
      >
        {content}
      </AppLink>
    )
  }
  return trigger === 'hover' ? (
    <span className="contents" onPointerEnter={replay}>
      {content}
    </span>
  ) : (
    content
  )
}

export { assembleOffset, Logo, type LogoAnimation, logoParts, type LogoTrigger }
