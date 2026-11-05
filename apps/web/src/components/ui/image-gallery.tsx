import { ChevronLeftIcon, ChevronRightIcon, XIcon, ZoomInIcon, ZoomOutIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import * as React from 'react'

import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface GalleryImage {
  src: string
  /** What the image shows. Required: it names the thumbnail button and the image. */
  alt: string
  /** A smaller file for the grid; `src` by default. */
  thumbnail?: string
  /** Shown under the image in the viewer. */
  caption?: React.ReactNode
}

function ImageLightbox({
  images,
  index,
  onIndexChange,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: {
  images: GalleryImage[]
  index: number
  onIndexChange: (index: number) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Where the focus goes on close (Radix Dialog's event); call preventDefault to move it yourself. */
  onCloseAutoFocus?: (event: Event) => void
}) {
  const { messages } = useCoreloomI18n()
  const t = messages.display.gallery
  const [zoomed, setZoomed] = React.useState(false)
  const image = images.at(index)
  const many = images.length > 1
  const go = (delta: number) => {
    setZoomed(false)
    onIndexChange((index + delta + images.length) % images.length)
  }

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) setZoomed(false)
        onOpenChange(next)
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-(--z-modal) bg-background/95 backdrop-blur-sm duration-base data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          data-slot="image-lightbox"
          aria-describedby={undefined}
          className="fixed inset-0 z-(--z-modal) flex flex-col font-sans text-foreground outline-none"
          onCloseAutoFocus={onCloseAutoFocus}
          onKeyDown={(e) => {
            if (!many) return
            if (e.key === 'ArrowRight') {
              e.preventDefault()
              go(1)
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault()
              go(-1)
            }
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {t.viewer}: {image?.alt}
          </DialogPrimitive.Title>
          <div className="flex h-14 shrink-0 items-center gap-1 px-3">
            <p
              aria-live="polite"
              className="m-0 mr-auto pl-2 font-mono text-[12.5px] text-fg-secondary"
            >
              {many ? t.counter(index + 1, images.length) : null}
            </p>
            <LightboxButton
              label={zoomed ? t.zoomOut : t.zoomIn}
              onClick={() => {
                setZoomed((z) => !z)
              }}
            >
              {zoomed ? <ZoomOutIcon /> : <ZoomInIcon />}
            </LightboxButton>
            <DialogPrimitive.Close asChild>
              <LightboxButton label={messages.common.close}>
                <XIcon />
              </LightboxButton>
            </DialogPrimitive.Close>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16">
            {many ? (
              <LightboxButton
                label={t.previous}
                className="absolute left-2 z-10 sm:left-4"
                onClick={() => {
                  go(-1)
                }}
              >
                <ChevronLeftIcon />
              </LightboxButton>
            ) : null}
            <div
              className={cn(
                'flex size-full items-center justify-center',
                zoomed ? 'overflow-auto' : 'overflow-hidden',
              )}
            >
              {image ? (
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- the zoom button does the same from the keyboard
                <img
                  key={image.src}
                  src={image.src}
                  alt={image.alt}
                  className={cn(
                    'select-none',
                    zoomed
                      ? 'max-w-none cursor-zoom-out'
                      : 'max-h-full max-w-full cursor-zoom-in object-contain',
                  )}
                  onClick={() => {
                    setZoomed((z) => !z)
                  }}
                />
              ) : null}
            </div>
            {many ? (
              <LightboxButton
                label={t.next}
                className="absolute right-2 z-10 sm:right-4"
                onClick={() => {
                  go(1)
                }}
              >
                <ChevronRightIcon />
              </LightboxButton>
            ) : null}
          </div>
          <div className="flex min-h-14 shrink-0 items-center justify-center px-6 py-3 text-center text-[13.5px] text-fg-secondary">
            {image?.caption ?? null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function LightboxButton({
  label,
  className,
  children,
  ...props
}: { label: string } & React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'flex size-10 cursor-pointer items-center justify-center rounded-full border border-border bg-secondary/80 text-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring [&_svg]:size-5',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

function ImageGallery({
  images,
  columns = 3,
  aspect = 'square',
  className,
  'aria-label': ariaLabel,
}: {
  images: GalleryImage[]
  /** Columns from the small breakpoint up (2 below). Default 3. */
  columns?: 2 | 3 | 4 | 5
  /** The thumbnails' shape. square by default; video for 16:9 screenshots. */
  aspect?: 'square' | 'video' | 'portrait'
  className?: string
  'aria-label'?: string
}) {
  const t = useCoreloomI18n().messages.display.gallery
  const [open, setOpen] = React.useState(false)
  const [index, setIndex] = React.useState(0)
  const listRef = React.useRef<HTMLUListElement>(null)
  return (
    <>
      <ul
        ref={listRef}
        data-slot="image-gallery"
        aria-label={ariaLabel ?? t.label}
        className={cn(
          'm-0 grid list-none grid-cols-2 gap-2 p-0',
          columns === 3 && 'sm:grid-cols-3',
          columns === 4 && 'sm:grid-cols-4',
          columns === 5 && 'sm:grid-cols-5',
          className,
        )}
      >
        {images.map((image, i) => (
          <li key={image.src} className="min-w-0">
            <button
              type="button"
              aria-label={t.open(image.alt)}
              className={cn(
                'group block w-full cursor-zoom-in overflow-hidden rounded-md border border-border bg-inset outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
                aspect === 'square' && 'aspect-square',
                aspect === 'video' && 'aspect-video',
                aspect === 'portrait' && 'aspect-[3/4]',
              )}
              onClick={() => {
                setIndex(i)
                setOpen(true)
              }}
            >
              <img
                src={image.thumbnail ?? image.src}
                alt=""
                loading="lazy"
                className="size-full object-cover transition-transform duration-base group-hover:scale-[1.03] motion-reduce:transition-none"
              />
            </button>
          </li>
        ))}
      </ul>
      <ImageLightbox
        images={images}
        index={index}
        onIndexChange={setIndex}
        open={open}
        onOpenChange={setOpen}
        onCloseAutoFocus={(e) => {
          // Back to the thumbnail of the image last shown.
          const thumb = listRef.current?.querySelectorAll('button').item(index)
          if (thumb) {
            e.preventDefault()
            thumb.focus()
          }
        }}
      />
    </>
  )
}

export { type GalleryImage, ImageGallery, ImageLightbox }
