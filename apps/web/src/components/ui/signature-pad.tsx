import { EraserIcon, PenLineIcon, TypeIcon } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

function SignaturePad({
  onValueChange,
  height = 160,
  disabled,
  id,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: {
  /** The signature as a PNG data URL, or null once cleared. Called when a stroke ends. */
  onValueChange?: (dataUrl: string | null) => void
  /** Height of the drawing box in px (default 160); it takes the container's width. */
  height?: number
  disabled?: boolean
  /** Goes on the typed-name field, so a FieldLabel names it in typing mode. */
  id?: string
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}) {
  const t = useCoreloomI18n().messages.inputs.signature
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const drawing = React.useRef<{ x: number; y: number } | null>(null)
  const [mode, setMode] = React.useState<'draw' | 'type'>('draw')
  const [empty, setEmpty] = React.useState(true)
  const [typed, setTyped] = React.useState('')
  const typedId = React.useId()

  // Sizes the bitmap to the box at the screen's pixel density, so strokes stay sharp.
  const setup = React.useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const ratio = window.devicePixelRatio || 1
    const width = canvas.clientWidth
    canvas.width = width * ratio
    canvas.height = height * ratio
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.25
    ctx.strokeStyle = getComputedStyle(canvas).color
    ctx.fillStyle = getComputedStyle(canvas).color
  }, [height])

  React.useLayoutEffect(setup, [setup, mode])

  const emit = () => {
    const canvas = canvasRef.current
    if (canvas) onValueChange?.(canvas.toDataURL('image/png'))
  }

  const clear = () => {
    const canvas = canvasRef.current
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    setEmpty(true)
    setTyped('')
    onValueChange?.(null)
  }

  // Typing mode writes the name in a handwriting-like font on the same canvas.
  const writeName = (name: string) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!name.trim()) {
      setEmpty(true)
      onValueChange?.(null)
      return
    }
    const width = canvas.clientWidth
    let size = 44
    ctx.font = `italic ${String(size)}px "Segoe Script", "Bradley Hand", "Brush Script MT", cursive`
    while (ctx.measureText(name).width > width - 32 && size > 16) {
      size -= 2
      ctx.font = `italic ${String(size)}px "Segoe Script", "Bradley Hand", "Brush Script MT", cursive`
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(name, width / 2, height / 2)
    setEmpty(false)
    emit()
  }

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  return (
    <div data-slot="signature-pad" className={cn('flex flex-col gap-2', className)}>
      <div
        className={cn(
          'relative overflow-hidden rounded-md border border-input bg-inset',
          (ariaInvalid === true || ariaInvalid === 'true') &&
            'border-destructive ring-[3px] ring-destructive-subtle',
          disabled && 'opacity-55',
        )}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={
            ariaLabel ? `${ariaLabel}: ${empty ? t.empty : t.signed}` : empty ? t.empty : t.signed
          }
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          style={{ height }}
          className={cn(
            'block w-full touch-none text-foreground',
            mode === 'draw' && !disabled ? 'cursor-crosshair' : 'pointer-events-none',
          )}
          onPointerDown={(e) => {
            if (disabled || mode !== 'draw' || e.button !== 0) return
            e.currentTarget.setPointerCapture(e.pointerId)
            const p = point(e)
            drawing.current = p
            // A dot for a tap.
            const ctx = e.currentTarget.getContext('2d')
            ctx?.beginPath()
            ctx?.arc(p.x, p.y, 1.1, 0, Math.PI * 2)
            ctx?.fill()
          }}
          onPointerMove={(e) => {
            const from = drawing.current
            const ctx = e.currentTarget.getContext('2d')
            if (!from || !ctx) return
            const to = point(e)
            ctx.beginPath()
            ctx.moveTo(from.x, from.y)
            ctx.lineTo(to.x, to.y)
            ctx.stroke()
            drawing.current = to
          }}
          onPointerUp={() => {
            if (!drawing.current) return
            drawing.current = null
            setEmpty(false)
            emit()
          }}
          onPointerCancel={() => {
            drawing.current = null
          }}
        />
        {mode === 'draw' && empty && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-6 bottom-6 flex items-end gap-2 border-b border-dashed border-border-strong pb-1 text-[12px] text-muted-foreground"
          >
            <PenLineIcon className="size-3.5" />
            {t.drawHere}
          </span>
        )}
      </div>
      {mode === 'type' && (
        <div className="flex flex-col gap-1">
          <label htmlFor={id ?? typedId} className="text-[12px] text-muted-foreground">
            {t.typeName}
          </label>
          <input
            id={id ?? typedId}
            type="text"
            value={typed}
            disabled={disabled}
            autoComplete="name"
            aria-describedby={ariaDescribedBy}
            aria-invalid={ariaInvalid}
            className="h-9 w-full rounded-md border border-input bg-inset px-2.5 font-sans text-[14px] text-foreground outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring"
            onChange={(e) => {
              setTyped(e.target.value)
              writeName(e.target.value)
            }}
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => {
            clear()
            setMode(mode === 'draw' ? 'type' : 'draw')
          }}
        >
          {mode === 'draw' ? <TypeIcon /> : <PenLineIcon />}
          {mode === 'draw' ? t.typeInstead : t.drawInstead}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={(disabled ?? false) || empty}
          className="ml-auto"
          onClick={clear}
        >
          <EraserIcon />
          {t.clear}
        </Button>
      </div>
    </div>
  )
}

export { SignaturePad }
