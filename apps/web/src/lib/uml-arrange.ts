import type { UmlDirection, UmlLayout, UmlSpec } from '@/lib/uml'

interface ArrangeBox {
  id: string
  x: number
  y: number
  width: number
  height: number
}

type UmlAlignment =
  | 'left'
  | 'center'
  | 'right'
  | 'top'
  | 'middle'
  | 'bottom'
  | 'distributeHorizontally'
  | 'distributeVertically'

const ALIGNMENTS: readonly UmlAlignment[] = [
  'left',
  'center',
  'right',
  'top',
  'middle',
  'bottom',
  'distributeHorizontally',
  'distributeVertically',
]

/** Spacing needs three boxes (with two, there's no gap to even out); lining up needs two. */
function canAlign(how: UmlAlignment, count: number): boolean {
  return how.startsWith('distribute') ? count >= 3 : count >= 2
}

const round = (n: number) => Math.round(n)

function lineUp(boxes: readonly ArrangeBox[], how: UmlAlignment): UmlLayout {
  const left = Math.min(...boxes.map((b) => b.x))
  const right = Math.max(...boxes.map((b) => b.x + b.width))
  const top = Math.min(...boxes.map((b) => b.y))
  const bottom = Math.max(...boxes.map((b) => b.y + b.height))
  const place = (b: ArrangeBox): { x: number; y: number } => {
    switch (how) {
      case 'left':
        return { x: left, y: b.y }
      case 'center':
        return { x: (left + right) / 2 - b.width / 2, y: b.y }
      case 'right':
        return { x: right - b.width, y: b.y }
      case 'top':
        return { x: b.x, y: top }
      case 'middle':
        return { x: b.x, y: (top + bottom) / 2 - b.height / 2 }
      default:
        return { x: b.x, y: bottom - b.height }
    }
  }
  return Object.fromEntries(
    boxes.map((b) => {
      const p = place(b)
      return [b.id, { x: round(p.x), y: round(p.y) }]
    }),
  )
}

/** Equal gaps between the boxes, the first and last staying where they are. */
function spread(boxes: readonly ArrangeBox[], axis: 'x' | 'y'): UmlLayout {
  const size = axis === 'x' ? 'width' : 'height'
  const sorted = [...boxes].sort((a, b) => a[axis] - b[axis])
  const first = sorted.at(0)
  const last = sorted.at(-1)
  if (!first || !last) return {}
  const used = sorted.reduce((sum, b) => sum + b[size], 0)
  const gap = (last[axis] + last[size] - first[axis] - used) / (sorted.length - 1)
  const out: UmlLayout = {}
  let at = first[axis]
  for (const b of sorted) {
    out[b.id] = axis === 'x' ? { x: round(at), y: round(b.y) } : { x: round(b.x), y: round(at) }
    at += b[size] + gap
  }
  return out
}

/**
 * New positions for `boxes` lined up or spaced as asked, by id. Give boxes in one coordinate
 * space (the same frame); positions that don't change are included too.
 */
function alignBoxes(boxes: readonly ArrangeBox[], how: UmlAlignment): UmlLayout {
  if (!canAlign(how, boxes.length)) return {}
  if (how === 'distributeHorizontally') return spread(boxes, 'x')
  if (how === 'distributeVertically') return spread(boxes, 'y')
  return lineUp(boxes, how)
}

const DIRECTIONS: readonly UmlDirection[] = ['TB', 'LR', 'BT', 'RL']

/** The diagram flowing another way, laid out afresh (dragged positions are dropped). */
function setDirection(diagram: UmlSpec, direction: UmlDirection): UmlSpec {
  if (diagram.kind === 'sequence') return diagram
  const { layout: _layout, direction: _old, ...rest } = diagram
  return direction === 'TB' ? rest : { ...rest, direction }
}

/** The diagram without dragged positions: everything is laid out automatically again. */
function clearLayout(diagram: UmlSpec): UmlSpec {
  if (diagram.kind === 'sequence' || !diagram.layout) return diagram
  const { layout: _layout, ...rest } = diagram
  return rest
}

export {
  alignBoxes,
  ALIGNMENTS,
  type ArrangeBox,
  canAlign,
  clearLayout,
  DIRECTIONS,
  setDirection,
  type UmlAlignment,
}
