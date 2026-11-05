import * as React from 'react'

import { Marquee } from '@/components/ui/marquee'
import { AppLink } from '@/lib/link'
import { cn } from '@/lib/utils'

interface LogoCloudItem {
  /** The brand's name, said by screen readers (and shown when there is no logo). */
  name: string
  /** An inline SVG or an <img alt="">. */
  logo?: React.ReactNode
  /** A case study or the brand's site. */
  href?: string
}

function LogoCloud({
  items,
  layout = 'grid',
  columns = 4,
  muted = true,
  label,
  className,
  ...props
}: {
  items: LogoCloudItem[]
  /** grid (default) or marquee (scrolls, with a pause button). */
  layout?: 'grid' | 'marquee'
  /** Columns of the grid from the sm breakpoint (two on phones). */
  columns?: 3 | 4 | 5 | 6
  /** Shows the logos in one muted tone until hover or focus. */
  muted?: boolean
  /** Names the list for screen readers ("Our customers"); the heading above it can do that too. */
  label?: string
} & React.ComponentProps<'div'>) {
  const cell = cn(
    'group/logo flex h-14 items-center justify-center px-4 text-muted-foreground transition-[color,filter] duration-base ease-out',
    muted &&
      'grayscale hover:text-foreground hover:grayscale-0 focus-visible:text-foreground focus-visible:grayscale-0',
  )
  const entries = items.map((item) => {
    const body = item.logo ? (
      <>
        {/* Only the drawing fades: a name written as text keeps a readable contrast. */}
        <span
          aria-hidden
          className={cn(
            'inline-flex h-8 transition-opacity duration-base ease-out [&_img]:h-full [&_img]:w-auto [&_svg]:h-full [&_svg]:w-auto',
            muted && 'opacity-70 group-hover/logo:opacity-100 group-focus-visible/logo:opacity-100',
          )}
        >
          {item.logo}
        </span>
        <span className="sr-only">{item.name}</span>
      </>
    ) : (
      <span className="font-display text-[16px] font-semibold">{item.name}</span>
    )
    return (
      <li key={item.name} className="list-none">
        {item.href ? (
          <AppLink
            href={item.href}
            className={cn(
              cell,
              'rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
            )}
          >
            {body}
          </AppLink>
        ) : (
          <span className={cell}>{body}</span>
        )}
      </li>
    )
  })
  const grid = {
    3: 'sm:grid-cols-3',
    4: 'sm:grid-cols-4',
    5: 'sm:grid-cols-5',
    6: 'sm:grid-cols-6',
  }[columns]

  return (
    <div data-slot="logo-cloud" data-layout={layout} className={className} {...props}>
      {layout === 'marquee' ? (
        <Marquee gap="1rem">
          <ul className="m-0 flex gap-4 p-0" aria-label={label}>
            {entries}
          </ul>
        </Marquee>
      ) : (
        <ul aria-label={label} className={cn('m-0 grid grid-cols-2 gap-2 p-0', grid)}>
          {entries}
        </ul>
      )}
    </div>
  )
}

export { LogoCloud, type LogoCloudItem }
