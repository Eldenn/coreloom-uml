import { toPng, toSvg } from 'html-to-image'

type UmlImageFormat = 'svg' | 'png'
/** What a download menu offers: an image file, or the print dialog for a PDF. */
type UmlDownloadFormat = UmlImageFormat | 'pdf'

interface ImageArea {
  width: number
  height: number
  /** Styles for the copy that's drawn (a transform that frames the elements, say). */
  style?: Partial<CSSStyleDeclaration>
  /** Draws it in the light theme whatever the page's: for paper. */
  light?: boolean
}

/** The first background colour that isn't transparent, from `node` up; white when none is. */
function backgroundOf(node: Element): string {
  for (let el: Element | null = node; el; el = el.parentElement) {
    const color = getComputedStyle(el).backgroundColor
    if (color && color !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(color)) return color
  }
  return '#ffffff'
}

/** Connection dots and the rename field aren't part of the picture. */
function drawn(node: HTMLElement): boolean {
  // Typed as an element, but text nodes come through too.
  const el: Node = node
  if (!(el instanceof Element)) return true
  return !el.classList.contains('react-flow__handle') && !el.hasAttribute('data-uml-export-skip')
}

/**
 * The SVG with `color` behind everything. html-to-image paints the background on the copy it
 * draws, so a copy moved by a transform leaves the strips it moved away from unpainted.
 */
function onBackground(url: string, color: string): string {
  const comma = url.indexOf(',')
  const svg = decodeURIComponent(url.slice(comma + 1)).replace(
    '<foreignObject',
    `<rect width="100%" height="100%" fill="${color}"/><foreignObject`,
  )
  return `${url.slice(0, comma + 1)}${encodeURIComponent(svg)}`
}

/** Puts the diagram around `node` in the light theme; the function returned puts it back. */
function lightTheme(node: HTMLElement): () => void {
  const diagram = node.closest<HTMLElement>('[data-slot="uml-diagram"]')
  if (!diagram) return () => undefined
  const before = diagram.getAttribute('data-theme')
  diagram.setAttribute('data-theme', 'light')
  return () => {
    if (before === null) diagram.removeAttribute('data-theme')
    else diagram.setAttribute('data-theme', before)
  }
}

/** `node` drawn as an image of `area`'s size, on the background it sits on. */
async function elementImage(
  node: HTMLElement,
  format: UmlImageFormat,
  area: ImageArea,
): Promise<string> {
  const restore = area.light ? lightTheme(node) : undefined
  try {
    const backgroundColor = backgroundOf(node)
    const options = {
      width: Math.ceil(area.width),
      height: Math.ceil(area.height),
      backgroundColor,
      pixelRatio: format === 'png' ? 2 : 1,
      filter: drawn,
      ...(area.style ? { style: area.style } : {}),
    }
    if (format === 'png') return await toPng(node, options)
    return onBackground(await toSvg(node, options), backgroundColor)
  } finally {
    restore?.()
  }
}

/** Space around the boxes in an exported image. */
const IMAGE_PAD = 24

/**
 * The box around all that is drawn, in the diagram's coordinates: the boxes, and the lines and
 * labels that go around them (a line back to an element above runs outside the boxes).
 */
function drawnBounds(viewport: HTMLElement) {
  const origin = viewport.getBoundingClientRect()
  const zoom = new DOMMatrix(getComputedStyle(viewport).transform).a
  const rects = [
    ...viewport.querySelectorAll(
      '.react-flow__node, .react-flow__edge-path, .react-flow__edgelabel-renderer > *',
    ),
  ]
    .map((el) => el.getBoundingClientRect())
    // A straight line has no width or no height, but not neither.
    .filter((r) => r.width > 0 || r.height > 0)
  if (rects.length === 0) return null
  const left = Math.min(...rects.map((r) => r.left))
  const top = Math.min(...rects.map((r) => r.top))
  return {
    x: (left - origin.left) / zoom,
    y: (top - origin.top) / zoom,
    width: (Math.max(...rects.map((r) => r.right)) - left) / zoom,
    height: (Math.max(...rects.map((r) => r.bottom)) - top) / zoom,
  }
}

/** The canvas's boxes and lines as an image, framed to fit them at their real size. */
function canvasImage(
  root: HTMLElement | null,
  { format, light = false }: { format: UmlImageFormat; light?: boolean },
): Promise<string> {
  const viewport = root?.querySelector<HTMLElement>('.react-flow__viewport')
  const b = viewport ? drawnBounds(viewport) : null
  if (!viewport || !b) return Promise.reject(new Error('Nothing drawn yet'))
  return elementImage(viewport, format, {
    light,
    width: b.width + 2 * IMAGE_PAD,
    height: b.height + 2 * IMAGE_PAD,
    style: {
      width: `${String(b.width + 2 * IMAGE_PAD)}px`,
      height: `${String(b.height + 2 * IMAGE_PAD)}px`,
      transform: `translate(${String(IMAGE_PAD - b.x)}px, ${String(IMAGE_PAD - b.y)}px) scale(1)`,
    },
  })
}

/**
 * Opens the browser's print dialog on `url` (an image) alone, on a page of the image's size, named
 * `title`. Resolves once the dialog is open; the reader picks "Save as PDF" there.
 */
async function printImage(url: string, title: string): Promise<void> {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  // Not `display: none`: some browsers print nothing from a frame that isn't laid out.
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.append(frame)
  const page = frame.contentDocument
  const view = frame.contentWindow
  try {
    if (!page || !view) throw new Error('Nothing to print in')
    // Loaded in the frame itself: an image moved in from the page is loaded again by Safari, and
    // would be printed before it is there.
    const image = page.createElement('img')
    image.src = url
    page.body.append(image)
    await image.decode()
    const width = String(image.naturalWidth)
    const height = String(image.naturalHeight)
    const style = page.createElement('style')
    style.textContent = `@page { size: ${width}px ${height}px; margin: 0 } html, body { margin: 0 } img { display: block; width: ${width}px; height: ${height}px }`
    page.head.append(style)
    page.title = title
    view.addEventListener('afterprint', () => {
      frame.remove()
    })
    view.focus()
    view.print()
  } catch (error) {
    frame.remove()
    throw error
  }
}

export {
  canvasImage,
  elementImage,
  type ImageArea,
  printImage,
  type UmlDownloadFormat,
  type UmlImageFormat,
}
