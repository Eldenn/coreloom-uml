'use client'

// Coreloom UI — Reveal. Content that arrives as it scrolls into view: a fade, a short slide, a
// scale or a blur, once. `Stagger` does the same for a list or a grid, one item after the other.
// For people who ask for reduced motion the content is simply there. `useInView` and
// `useReducedMotion` are the hooks underneath, for your own effects.
//
//   <Reveal effect="up"><FeatureGrid /></Reveal>
//   <Stagger className="grid grid-cols-3 gap-4">{cards}</Stagger>
import * as React from 'react'

import { cn } from '@/lib/utils'

type RevealEffect =
  | 'fade'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'scale'
  | 'blur'
  | 'wipe-up'
  | 'wipe-down'
  | 'wipe-left'
  | 'wipe-right'
  | 'circle'

interface InViewOptions {
  /** Stop watching after the first time it is seen (the default), or follow it in and out. */
  once?: boolean
  /** How much of it must be visible, from 0 to 1. */
  threshold?: number
  /** Grows or shrinks the viewport, as in IntersectionObserver ("0px 0px -10% 0px"). */
  rootMargin?: string
}

/** Whether an element is in the viewport. True at once where IntersectionObserver is missing. */
function useInView<T extends Element>(
  ref: React.RefObject<T | null>,
  { once = true, threshold = 0.15, rootMargin = '0px' }: InViewOptions = {},
) {
  // Without IntersectionObserver (old browsers, some test runners) the content shows at once.
  const [inView, setInView] = React.useState(
    () => typeof window !== 'undefined' && typeof IntersectionObserver === 'undefined',
  )
  React.useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true)
            if (once) observer.disconnect()
          } else if (!once) {
            setInView(false)
          }
        }
      },
      { threshold, rootMargin },
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [ref, once, threshold, rootMargin])
  return inView
}

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(reducedMotionQuery)
  query.addEventListener('change', onChange)
  return () => {
    query.removeEventListener('change', onChange)
  }
}

/** Whether the person asked their system for reduced motion (false on the server). */
function useReducedMotion() {
  return React.useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(reducedMotionQuery).matches,
    () => false,
  )
}

/** Where each effect starts from; the resting state is always opacity 1, no offset, no blur. */
const hiddenClass: Record<RevealEffect, string> = {
  fade: 'opacity-0',
  up: 'translate-y-4 opacity-0',
  down: '-translate-y-4 opacity-0',
  left: 'translate-x-6 opacity-0',
  right: '-translate-x-6 opacity-0',
  scale: 'scale-95 opacity-0',
  blur: 'opacity-0 blur-sm',
  // Wipes and the circle uncover the content through a mask (clip-path): best for images.
  'wipe-up': '[clip-path:inset(100%_0_0_0)]',
  'wipe-down': '[clip-path:inset(0_0_100%_0)]',
  'wipe-left': '[clip-path:inset(0_0_0_100%)]',
  'wipe-right': '[clip-path:inset(0_100%_0_0)]',
  circle: '[clip-path:circle(0%_at_50%_50%)]',
}

/** The masks need an end value to animate to (a clip-path can't animate from or to none). */
const shownClass: Partial<Record<RevealEffect, string>> = {
  'wipe-up': '[clip-path:inset(0_0_0_0)]',
  'wipe-down': '[clip-path:inset(0_0_0_0)]',
  'wipe-left': '[clip-path:inset(0_0_0_0)]',
  'wipe-right': '[clip-path:inset(0_0_0_0)]',
  circle: '[clip-path:circle(75%_at_50%_50%)]',
}

const revealClass =
  'transition-[opacity,translate,scale,filter,clip-path] duration-reveal ease-out motion-reduce:transition-none'

function Reveal({
  effect = 'up',
  delay = 0,
  once,
  threshold,
  rootMargin,
  className,
  style,
  ref: refProp,
  ...props
}: {
  /** fade, up (rises into place), down, left (comes from the right), right, scale, blur, or a
   *  mask that uncovers it: wipe-up, wipe-down, wipe-left, wipe-right, circle. */
  effect?: RevealEffect
  /** Milliseconds to wait once it is in view. */
  delay?: number
} & InViewOptions &
  React.ComponentProps<'div'>) {
  const ref = React.useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once, threshold, rootMargin })
  const setRef = (node: HTMLDivElement | null) => {
    ref.current = node
    if (typeof refProp === 'function') refProp(node)
    else if (refProp) refProp.current = node
  }
  const animated = {
    className: cn(revealClass, inView ? shownClass[effect] : hiddenClass[effect], className),
    style: { transitionDelay: delay ? `${delay}ms` : undefined, ...style },
    ...props,
  }
  // A mask hides the element from IntersectionObserver too: watch a plain box around it instead.
  if (effect in shownClass) {
    return (
      <div ref={setRef} data-slot="reveal" data-state={inView ? 'visible' : 'hidden'}>
        <div {...animated} />
      </div>
    )
  }
  return (
    <div ref={setRef} data-slot="reveal" data-state={inView ? 'visible' : 'hidden'} {...animated} />
  )
}

function Stagger({
  effect = 'up',
  step = 70,
  delay = 0,
  once,
  threshold,
  rootMargin,
  itemClassName,
  className,
  children,
  ...props
}: {
  /** The effect of each item. */
  effect?: RevealEffect
  /** Milliseconds between one item and the next. */
  step?: number
  /** Milliseconds before the first item. */
  delay?: number
  /** Classes for the element around each item (grid spans, heights). */
  itemClassName?: string
} & InViewOptions &
  React.ComponentProps<'div'>) {
  const ref = React.useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once, threshold, rootMargin })
  // Each item gets its own wrapper (and delay), so the items' own props stay untouched.
  // eslint-disable-next-line @eslint-react/no-children-to-array -- see above; toArray also gives each item a key.
  const items = React.Children.toArray(children)
  return (
    <div
      ref={ref}
      data-slot="stagger"
      data-state={inView ? 'visible' : 'hidden'}
      className={className}
      {...props}
    >
      {items.map((child, i) => (
        <div
          // eslint-disable-next-line @eslint-react/no-array-index-key -- toArray keys elements; only plain text items fall back to their place.
          key={React.isValidElement(child) ? (child.key ?? i) : i}
          data-slot="stagger-item"
          className={cn(
            revealClass,
            inView ? shownClass[effect] : hiddenClass[effect],
            itemClassName,
          )}
          // Past ten items the wait would get long: the rest arrive with the tenth.
          style={{ transitionDelay: `${delay + Math.min(i, 9) * step}ms` }}
        >
          {child}
        </div>
      ))}
    </div>
  )
}

export { type InViewOptions, Reveal, type RevealEffect, Stagger, useInView, useReducedMotion }
