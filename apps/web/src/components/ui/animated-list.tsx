'use client'

// Coreloom UI — AnimatedList. A list whose items slide open when they are added and fold away
// when they are removed, instead of jumping: notifications, a to-do list, uploaded files, a
// queue. Give every child a stable `key`; the list does the rest. Items that are leaving are
// hidden from screen readers and from Tab at once. For people who ask for reduced motion items
// simply appear and disappear.
//
//   <AnimatedList>{todos.map((t) => <TodoRow key={t.id} todo={t} />)}</AnimatedList>
import * as React from 'react'

import { cn } from '@/lib/utils'

type Phase = 'idle' | 'enter' | 'exit'
interface Item {
  key: string
  node: React.ReactElement
  phase: Phase
}

/** The new children, with the removed ones kept where they were, marked as leaving. */
function mergeItems(previous: Item[], next: React.ReactElement[]): Item[] {
  const nextKeys = new Set(next.map((n) => String(n.key)))
  const before = new Map(previous.map((p) => [p.key, p]))
  const result: Item[] = next.map((node) => {
    const old = before.get(String(node.key))
    return {
      key: String(node.key),
      node,
      phase: old ? (old.phase === 'exit' ? 'enter' : old.phase) : 'enter',
    }
  })
  previous.forEach((item, i) => {
    if (nextKeys.has(item.key)) return
    // Insert it after the closest earlier item that is still there.
    let at = 0
    for (let j = i - 1; j >= 0; j--) {
      const anchor = result.findIndex((r) => r.key === previous[j]?.key)
      if (anchor !== -1) {
        at = anchor + 1
        break
      }
    }
    result.splice(at, 0, { ...item, phase: 'exit' })
  })
  return result
}

function AnimatedList({
  as = 'ul',
  exitDuration = 180,
  animateOnMount = false,
  itemClassName,
  className,
  children,
  ...props
}: {
  /** The list element: ul (default), ol, or div for a list of anything. */
  as?: 'ul' | 'ol' | 'div'
  /** Milliseconds a removed item takes to fold away (keep it equal to the CSS, 180ms). */
  exitDuration?: number
  /** Plays the enter animation for the first items too. */
  animateOnMount?: boolean
  /** Classes for the element around each item (li, or div). */
  itemClassName?: string
} & React.HTMLAttributes<HTMLElement>) {
  // eslint-disable-next-line @eslint-react/no-children-to-array -- the list must compare its children by key between renders.
  const elements = React.Children.toArray(children).filter(React.isValidElement)
  const [state, setState] = React.useState(() => ({
    children,
    items: elements.map((node): Item => ({
      key: String(node.key),
      node,
      phase: animateOnMount ? 'enter' : 'idle',
    })),
  }))
  // New children: merge them during render (React's pattern for state derived from props).
  if (state.children !== children) {
    setState({ children, items: mergeItems(state.items, elements) })
  }
  const leaving = state.items.some((i) => i.phase === 'exit')
  React.useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(() => {
      setState((s) => ({ ...s, items: s.items.filter((i) => i.phase !== 'exit') }))
    }, exitDuration)
    return () => {
      clearTimeout(timer)
    }
  }, [leaving, state.items, exitDuration])

  const Tag = as
  const ItemTag = as === 'div' ? 'div' : 'li'
  return (
    <Tag data-slot="animated-list" className={cn('m-0 list-none p-0', className)} {...props}>
      {state.items.map((item) => (
        <ItemTag
          key={item.key}
          data-slot="animated-list-item"
          data-state={item.phase}
          aria-hidden={item.phase === 'exit' || undefined}
          inert={item.phase === 'exit'}
          className={cn(
            'grid',
            item.phase === 'enter' && 'animate-list-in',
            item.phase === 'exit' && 'pointer-events-none animate-list-out',
            itemClassName,
          )}
        >
          <div className="min-h-0">{item.node}</div>
        </ItemTag>
      ))}
    </Tag>
  )
}

export { AnimatedList, mergeItems }
