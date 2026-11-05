import * as React from 'react'

import { cn } from '@/lib/utils'

function AnimatedHeight({ className, style, children, ...props }: React.ComponentProps<'div'>) {
  const inner = React.useRef<HTMLDivElement>(null)
  const [height, setHeight] = React.useState<number | undefined>(undefined)
  React.useEffect(() => {
    const node = inner.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setHeight(entry.borderBoxSize[0]?.blockSize ?? node.offsetHeight)
    })
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [])
  return (
    <div
      data-slot="animated-height"
      className={cn(
        'overflow-hidden transition-[height] duration-slow ease-out motion-reduce:transition-none',
        className,
      )}
      style={{ height, ...style }}
      {...props}
    >
      <div ref={inner}>{children}</div>
    </div>
  )
}

export { AnimatedHeight }
