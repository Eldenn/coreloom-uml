'use client'

import { Slider as SliderPrimitive } from 'radix-ui'
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const t = useCoreloomI18n().messages
  const _values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
    [value, defaultValue, min, max],
  )

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-55 data-[orientation=horizontal]:min-h-6 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:min-w-6 data-[orientation=vertical]:flex-col',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative grow overflow-hidden rounded-pill bg-accent ring-1 ring-border ring-inset data-[orientation=horizontal]:h-1 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          aria-label={
            ariaLabel === undefined
              ? undefined
              : _values.length === 1
                ? ariaLabel
                : `${ariaLabel}, ${index === 0 ? t.slider.minimum : index === _values.length - 1 ? t.slider.maximum : index + 1}`
          }
          aria-labelledby={ariaLabelledby}
          className="relative block size-6 shrink-0 cursor-grab rounded-full transition-[box-shadow] duration-base ease-out outline-none before:absolute before:inset-[3px] before:rounded-full before:border-[3px] before:border-background before:bg-primary before:shadow-sm before:content-[''] hover:ring-4 hover:ring-primary-subtle focus-visible:ring-[3px] focus-visible:ring-ring active:cursor-grabbing disabled:pointer-events-none"
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
