'use client'

// Coreloom UI — AspectRatio. Keeps a box at a width-to-height ratio (16 / 9, 1, 4 / 3) whatever its
// width: images, videos, maps, previews. Radix's AspectRatio, as in shadcn.
import { AspectRatio as AspectRatioPrimitive } from 'radix-ui'
import * as React from 'react'

function AspectRatio({ ...props }: React.ComponentProps<typeof AspectRatioPrimitive.Root>) {
  return <AspectRatioPrimitive.Root data-slot="aspect-ratio" {...props} />
}

export { AspectRatio }
