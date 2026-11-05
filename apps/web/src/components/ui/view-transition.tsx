import * as React from 'react'
import { flushSync } from 'react-dom'

type ViewTransitionEffect = 'fade' | 'slide' | 'slide-back' | 'scale'

interface ViewTransitionOptions {
  /** fade (the browser's cross-fade, default), slide (forward), slide-back, or scale. */
  effect?: ViewTransitionEffect
}

/** Runs `update` inside a view transition, or straight away where there is none to run. */
function startViewTransition(update: () => void, { effect = 'fade' }: ViewTransitionOptions = {}) {
  const reduced =
    typeof window === 'undefined' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    typeof document.startViewTransition !== 'function'
  if (reduced) {
    update()
    return Promise.resolve()
  }
  const root = document.documentElement
  root.dataset.viewTransition = effect
  // flushSync: the browser takes its "after" picture as soon as the callback returns, so React
  // must have written the new view to the DOM by then.
  const transition = document.startViewTransition(() => {
    // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the View Transitions API needs the new view in the DOM when the callback returns.
    flushSync(update)
  })
  return transition.finished.finally(() => {
    if (root.dataset.viewTransition === effect) delete root.dataset.viewTransition
  })
}

/** `startViewTransition`, as a stable function for event handlers. */
function useViewTransition() {
  return React.useCallback(
    (update: () => void, options?: ViewTransitionOptions) => startViewTransition(update, options),
    [],
  )
}

export {
  startViewTransition,
  useViewTransition,
  type ViewTransitionEffect,
  type ViewTransitionOptions,
}
