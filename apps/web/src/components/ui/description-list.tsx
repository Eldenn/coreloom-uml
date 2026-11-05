import * as React from 'react'

import { CopyButton } from '@/components/copy-button'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type DescriptionLayout = 'stacked' | 'inline' | 'grid'

interface DescriptionItemData {
  term: React.ReactNode
  /** Empty (undefined, null, '') shows "Not set". */
  value?: React.ReactNode
  /** Text the Copy button copies; no button without it. */
  copy?: string
  /** A line under the value, in a smaller muted text. */
  hint?: React.ReactNode
  /** Spans every column in the grid layout (a long address, a description). */
  wide?: boolean
}

const LayoutContext = React.createContext<DescriptionLayout>('stacked')

const isEmpty = (value: React.ReactNode) => value === undefined || value === null || value === ''

function DescriptionList({
  items,
  layout = 'stacked',
  columns = 2,
  className,
  children,
  ...props
}: {
  items?: DescriptionItemData[]
  /** stacked: label above value; inline: label beside value, in rows; grid: stacked, in columns. */
  layout?: DescriptionLayout
  /** Columns of the grid layout, from the small breakpoint up. Default 2. */
  columns?: 2 | 3 | 4
  /** DescriptionItem elements, instead of `items`. */
  children?: React.ReactNode
} & Omit<React.ComponentProps<'dl'>, 'children'>) {
  return (
    <LayoutContext.Provider value={layout}>
      <dl
        data-slot="description-list"
        data-layout={layout}
        className={cn(
          'm-0 text-[14px]',
          layout === 'stacked' && 'flex flex-col gap-4',
          layout === 'inline' && 'flex flex-col divide-y divide-border-subtle',
          layout === 'grid' && 'grid grid-cols-1 gap-x-8 gap-y-5',
          layout === 'grid' && columns === 2 && 'sm:grid-cols-2',
          layout === 'grid' && columns === 3 && 'sm:grid-cols-3',
          layout === 'grid' && columns === 4 && 'sm:grid-cols-2 lg:grid-cols-4',
          className,
        )}
        {...props}
      >
        {items
          ? items.map((item, i) => (
              <DescriptionItem
                // Terms are usually unique strings; fall back to the position for nodes.
                // eslint-disable-next-line @eslint-react/no-array-index-key -- items have no id
                key={typeof item.term === 'string' ? item.term : i}
                term={item.term}
                copy={item.copy}
                hint={item.hint}
                wide={item.wide}
              >
                {item.value}
              </DescriptionItem>
            ))
          : children}
      </dl>
    </LayoutContext.Provider>
  )
}

function DescriptionItem({
  term,
  children,
  copy,
  hint,
  wide,
  className,
  ...props
}: {
  term: React.ReactNode
  /** The value. Empty shows "Not set". */
  children?: React.ReactNode
  copy?: string
  hint?: React.ReactNode
  wide?: boolean
} & Omit<React.ComponentProps<'div'>, 'children'>) {
  const layout = React.useContext(LayoutContext)
  const t = useCoreloomI18n().messages.display.descriptionList
  const empty = isEmpty(children)
  return (
    <div
      data-slot="description-item"
      className={cn(
        'flex min-w-0',
        layout === 'inline'
          ? 'flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:gap-6'
          : 'flex-col gap-1',
        layout === 'grid' && wide && 'col-span-full',
        className,
      )}
      {...props}
    >
      <dt
        className={cn(
          'text-[13px] text-muted-foreground',
          layout === 'inline' && 'sm:w-44 sm:shrink-0 sm:pt-px',
        )}
      >
        {term}
      </dt>
      <dd className="m-0 flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <div
            className={cn(
              'min-w-0 [overflow-wrap:anywhere] text-foreground',
              empty && 'text-muted-foreground italic',
            )}
          >
            {empty ? t.empty : children}
          </div>
          {copy && !empty ? <CopyButton value={copy} className="-my-1.5 shrink-0" /> : null}
        </div>
        {hint ? <div className="text-[12.5px] text-muted-foreground">{hint}</div> : null}
      </dd>
    </div>
  )
}

export { DescriptionItem, type DescriptionItemData, type DescriptionLayout, DescriptionList }
