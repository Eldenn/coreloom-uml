import { ZoomInIcon, ZoomOutIcon } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** Where the frame sits: its centre, as fractions of the image (0 to 1), and the zoom (1 = cover). */
interface ImageCropValue {
  x: number
  y: number
  zoom: number
}

interface Size {
  width: number
  height: number
}

const CENTERED: ImageCropValue = { x: 0.5, y: 0.5, zoom: 1 }
const MAX_ZOOM = 4

/** The share of the image's width and height the frame shows at a zoom. */
function visibleFraction(image: Size, aspect: number, zoom: number) {
  const imageAspect = image.width / image.height
  // At zoom 1 the frame covers the image: one side fits exactly, the other is cut.
  return aspect >= imageAspect
    ? { w: 1 / zoom, h: imageAspect / aspect / zoom }
    : { w: aspect / imageAspect / zoom, h: 1 / zoom }
}

/** Keeps the zoom between 1 and 4 and the frame inside the image. */
function clampCrop(value: ImageCropValue, image: Size, aspect: number): ImageCropValue {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, value.zoom))
  const v = visibleFraction(image, aspect, zoom)
  const clamp = (n: number, half: number) => Math.min(1 - half, Math.max(half, n))
  return { zoom, x: clamp(value.x, v.w / 2), y: clamp(value.y, v.h / 2) }
}

/** The part of the image the frame shows, in the image's pixels. */
function cropRect(value: ImageCropValue, image: Size, aspect: number) {
  const c = clampCrop(value, image, aspect)
  const v = visibleFraction(image, aspect, c.zoom)
  return {
    x: (c.x - v.w / 2) * image.width,
    y: (c.y - v.h / 2) * image.height,
    width: v.w * image.width,
    height: v.h * image.height,
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve(img)
    }
    img.onerror = () => {
      reject(new Error('The image could not be read.'))
    }
    img.src = src
  })
}

/**
 * Draws the framed part of `file` into a new File (same name and type; PNG for types a canvas can't
 * write), at most `maxSize` pixels on its longer side.
 */
async function cropImage(
  file: File,
  value: ImageCropValue,
  { aspect, maxSize = 1024 }: { aspect: number; maxSize?: number },
): Promise<File> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const rect = cropRect(value, { width: img.naturalWidth, height: img.naturalHeight }, aspect)
    const scale = Math.min(1, maxSize / Math.max(rect.width, rect.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(rect.width * scale))
    canvas.height = Math.max(1, Math.round(rect.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No 2D canvas.')
    ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height)
    const type = /^image\/(png|jpeg|webp)$/.test(file.type) ? file.type : 'image/png'
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, type, 0.92)
    })
    if (!blob) throw new Error('The image could not be written.')
    return new File([blob], file.name, { type, lastModified: file.lastModified })
  } finally {
    URL.revokeObjectURL(url)
  }
}

const KEY_STEP = 0.02

function nudge(value: ImageCropValue, key: string, fraction: { w: number; h: number }) {
  switch (key) {
    case 'ArrowLeft':
      return { ...value, x: value.x - KEY_STEP * fraction.w * 2 }
    case 'ArrowRight':
      return { ...value, x: value.x + KEY_STEP * fraction.w * 2 }
    case 'ArrowUp':
      return { ...value, y: value.y - KEY_STEP * fraction.h * 2 }
    case 'ArrowDown':
      return { ...value, y: value.y + KEY_STEP * fraction.h * 2 }
    case '+':
    case '=':
      return { ...value, zoom: value.zoom + 0.1 }
    case '-':
      return { ...value, zoom: value.zoom - 0.1 }
    default:
      return null
  }
}

function ImageCrop({
  src,
  aspect = 1,
  round = false,
  value: valueProp,
  defaultValue = CENTERED,
  onValueChange,
  className,
}: {
  /** The image: a URL or an object URL. */
  src: string
  /** Width ÷ height of the frame: 1 for an avatar, 16 / 9 for a cover. */
  aspect?: number
  /** A round frame (the crop itself stays rectangular; show it round). */
  round?: boolean
  value?: ImageCropValue
  defaultValue?: ImageCropValue
  onValueChange?: (value: ImageCropValue) => void
  className?: string
}) {
  const t = useCoreloomI18n().messages.imageCrop
  const [inner, setInner] = React.useState(defaultValue)
  const [size, setSize] = React.useState<Size | null>(null)
  const frameRef = React.useRef<HTMLDivElement>(null)
  const drag = React.useRef<{ x: number; y: number; start: ImageCropValue } | null>(null)
  const hintId = React.useId()
  const raw = valueProp ?? inner
  const value = size ? clampCrop(raw, size, aspect) : raw
  const fraction = size ? visibleFraction(size, aspect, value.zoom) : { w: 1, h: 1 }
  const set = (next: ImageCropValue) => {
    const clamped = size ? clampCrop(next, size, aspect) : next
    if (valueProp === undefined) setInner(clamped)
    onValueChange?.(clamped)
  }

  return (
    <div data-slot="image-crop" className={cn('flex flex-col gap-3', className)}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- a 2D drag area has no ARIA role; the zoom slider and the hint go with it */}
      <div
        ref={frameRef}
        role="group"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the arrow keys move the image, so the area takes focus
        tabIndex={0}
        aria-label={t.area}
        aria-describedby={hintId}
        className="relative w-full cursor-grab touch-none overflow-hidden rounded-md bg-inset outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring active:cursor-grabbing"
        style={{ aspectRatio: String(aspect) }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, y: e.clientY, start: value }
        }}
        onPointerMove={(e) => {
          const box = frameRef.current?.getBoundingClientRect()
          if (!drag.current || !box?.width) return
          const { start } = drag.current
          set({
            ...start,
            x: start.x - ((e.clientX - drag.current.x) / box.width) * fraction.w,
            y: start.y - ((e.clientY - drag.current.y) / box.height) * fraction.h,
          })
        }}
        onPointerUp={() => {
          drag.current = null
        }}
        onKeyDown={(e) => {
          const next = nudge(value, e.key, fraction)
          if (!next) return
          e.preventDefault()
          set(next)
        }}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          onLoad={(e) => {
            setSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })
          }}
          className="absolute max-w-none"
          style={{
            width: `${String(100 / fraction.w)}%`,
            height: `${String(100 / fraction.h)}%`,
            left: `${String((-(value.x - fraction.w / 2) / fraction.w) * 100)}%`,
            top: `${String((-(value.y - fraction.h / 2) / fraction.h) * 100)}%`,
          }}
        />
        {/* Darkens what falls outside a round frame; the ring marks its edge. */}
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 ring-2 ring-background/80 ring-inset',
            round &&
              'rounded-full shadow-[0_0_0_9999px_color-mix(in_oklab,var(--background)_60%,transparent)]',
          )}
        />
      </div>
      <p id={hintId} className="m-0 text-[12px] text-muted-foreground">
        {t.hint}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t.zoomOut}
          disabled={value.zoom <= 1}
          onClick={() => {
            set({ ...value, zoom: value.zoom - 0.25 })
          }}
        >
          <ZoomOutIcon />
        </Button>
        <Slider
          min={1}
          max={MAX_ZOOM}
          step={0.05}
          value={[value.zoom]}
          aria-label={t.zoom}
          aria-valuetext={t.zoomText(Math.round(value.zoom * 100))}
          onValueChange={([zoom]) => {
            set({ ...value, zoom })
          }}
          className="flex-1"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t.zoomIn}
          disabled={value.zoom >= MAX_ZOOM}
          onClick={() => {
            set({ ...value, zoom: value.zoom + 0.25 })
          }}
        >
          <ZoomInIcon />
        </Button>
      </div>
    </div>
  )
}

/** Asks for the crop of `file` in a dialog; Apply hands back the cropped file, Cancel null. */
function ImageCropDialog({
  file,
  aspect = 1,
  round = false,
  maxSize,
  onDone,
}: {
  /** The image to crop; the dialog is open while there is one. */
  file: File | null
  aspect?: number
  round?: boolean
  /** Longest side of the result, in pixels (default 1024). */
  maxSize?: number
  /** The cropped file, or null when cancelled. */
  onDone: (file: File | null) => void
}) {
  const t = useCoreloomI18n().messages.imageCrop
  const [value, setValue] = React.useState(CENTERED)
  const [busy, setBusy] = React.useState(false)
  const [url, setUrl] = React.useState<string | null>(null)
  // The dialog has no trigger: focus goes back to whatever had it when it opened.
  const opener = React.useRef<HTMLElement | null>(null)
  React.useEffect(() => {
    if (!file) return
    if (document.activeElement instanceof HTMLElement) opener.current = document.activeElement
    if (typeof URL.createObjectURL !== 'function') return
    const u = URL.createObjectURL(file)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL lives as long as the File
    setUrl(u)
    setValue(CENTERED)
    return () => {
      URL.revokeObjectURL(u)
    }
  }, [file])
  const apply = () => {
    if (!file) return
    setBusy(true)
    cropImage(file, value, { aspect, maxSize })
      .then(onDone, () => {
        // A browser that can't draw it: keep the image as it was rather than lose it.
        onDone(file)
      })
      .finally(() => {
        setBusy(false)
      })
  }
  return (
    <Dialog
      open={!!file}
      onOpenChange={(open) => {
        if (!open) onDone(null)
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          opener.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        {url && (
          <ImageCrop
            src={url}
            aspect={aspect}
            round={round}
            value={value}
            onValueChange={setValue}
          />
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onDone(null)
            }}
          >
            {t.cancel}
          </Button>
          <Button type="button" onClick={apply} disabled={busy} aria-busy={busy || undefined}>
            {t.apply}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export {
  clampCrop,
  cropImage,
  cropRect,
  ImageCrop,
  ImageCropDialog,
  type ImageCropValue,
  visibleFraction,
}
