'use client'

// Coreloom UI — Confetti. A short burst of confetti for a real success: onboarding finished, a
// first deploy, a payment that went through. It is drawn with the browser's own Web Animations
// (no canvas, no library), lasts about a second and a half, sits above everything without taking
// clicks, and cleans up after itself. Nothing happens for people who ask for reduced motion, so
// always say the success in words too.
//
//   <Button onClick={(e) => { publish(); void fireConfetti(e.currentTarget) }}>Publish</Button>

const COLORS = [
  '--color-primary',
  '--color-chart-2',
  '--color-chart-3',
  '--color-chart-4',
  '--color-success',
]

interface ConfettiOptions {
  /** How many pieces (default 60). */
  count?: number
  /** How far they fly, in pixels (default 220). */
  spread?: number
  /** Milliseconds the burst lasts (default 1400). */
  duration?: number
}

/**
 * Bursts confetti from the centre of an element, or from a point in the viewport, or from the
 * top centre of the screen when nothing is given. Resolves once the pieces are gone.
 */
function fireConfetti(
  origin?: Element | { x: number; y: number },
  { count = 60, spread = 220, duration = 1400 }: ConfettiOptions = {},
) {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve()
  let x = window.innerWidth / 2
  let y = window.innerHeight / 3
  if (origin instanceof Element) {
    const rect = origin.getBoundingClientRect()
    x = rect.left + rect.width / 2
    y = rect.top + rect.height / 2
  } else if (origin) {
    ;({ x, y } = origin)
  }
  const layer = document.createElement('div')
  layer.setAttribute('aria-hidden', 'true')
  layer.dataset.slot = 'confetti'
  layer.style.cssText =
    'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:var(--z-toast,1500)'
  document.body.append(layer)
  const styles = getComputedStyle(document.documentElement)
  const animations: Promise<unknown>[] = []
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('span')
    const size = 5 + Math.random() * 5
    const color = styles.getPropertyValue(COLORS[i % COLORS.length]).trim()
    piece.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size * (Math.random() < 0.5 ? 0.45 : 1)}px;background:${color || 'currentColor'};border-radius:${Math.random() < 0.3 ? '50%' : '1px'}`
    layer.append(piece)
    // Up and out, then down with gravity: a curve in three keyframes.
    const angle = Math.random() * Math.PI * 2
    const distance = spread * (0.4 + Math.random() * 0.6)
    const dx = Math.cos(angle) * distance
    const dy = Math.sin(angle) * distance * 0.7 - spread * 0.35
    const spin = (Math.random() - 0.5) * 900
    animations.push(
      piece.animate(
        [
          { transform: 'translate(-50%, -50%) rotate(0deg)', opacity: 1 },
          {
            transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${spin / 2}deg)`,
            opacity: 1,
            offset: 0.45,
          },
          {
            transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy + spread * 0.9}px)) rotate(${spin}deg)`,
            opacity: 0,
          },
        ],
        {
          duration: duration * (0.75 + Math.random() * 0.25),
          easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)',
          fill: 'forwards',
        },
      ).finished,
    )
  }
  return Promise.allSettled(animations).then(() => {
    layer.remove()
  })
}

export { type ConfettiOptions, fireConfetti }
