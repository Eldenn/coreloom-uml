'use client'

// Coreloom UI — TabsIndicator. A highlight that slides to the active tab instead of jumping:
// put it last inside a TabsList (or any row of [data-state=active] / [aria-selected=true]
// triggers). It follows clicks, the arrow keys and resizes. While it is there, theme.css hands
// the active tab's own background (or underline) over to it; the active tab keeps its text
// color, and in forced-colors mode its own styles come back.
//
//   <TabsList>…<TabsTrigger value="b">B</TabsTrigger><TabsIndicator /></TabsList>
//   <TabsList variant="line">…<TabsIndicator variant="line" /></TabsList>
import * as React from 'react'

import { cn } from '@/lib/utils'

const ACTIVE = '[data-state="active"], [aria-selected="true"], [aria-checked="true"]'

function TabsIndicator({
  variant = 'pill',
  className,
  style,
  ...props
}: {
  /** pill: a raised background behind the tab; line: a bar under it. */
  variant?: 'pill' | 'line'
} & Omit<React.ComponentProps<'span'>, 'children'>) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const [box, setBox] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null)
  React.useEffect(() => {
    const list = ref.current?.parentElement
    if (!list) return
    const measure = () => {
      const active = list.querySelector<HTMLElement>(ACTIVE)
      if (!active) {
        setBox(null)
        return
      }
      setBox({
        x: active.offsetLeft,
        y: active.offsetTop,
        w: active.offsetWidth,
        h: active.offsetHeight,
      })
    }
    measure()
    const mutations = new MutationObserver(measure)
    mutations.observe(list, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state', 'aria-selected', 'aria-checked'],
    })
    const sizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    sizes?.observe(list)
    return () => {
      mutations.disconnect()
      sizes?.disconnect()
    }
  }, [])
  return (
    <span
      ref={ref}
      aria-hidden
      data-slot="tabs-indicator"
      data-variant={variant}
      className={cn(
        'pointer-events-none absolute top-0 left-0 transition-[translate,width,height,opacity] duration-slow ease-out motion-reduce:transition-none',
        variant === 'pill' ? '-z-10 rounded-sm bg-accent' : '-z-10 h-0.5! rounded-full bg-primary',
        !box && 'opacity-0',
        className,
      )}
      style={{
        width: box?.w,
        height: box?.h,
        translate: box
          ? `${box.x}px ${variant === 'line' ? box.y + box.h - 2 : box.y}px`
          : undefined,
        ...style,
      }}
      {...props}
    />
  )
}

export { TabsIndicator }
