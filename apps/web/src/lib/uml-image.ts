import { toPng, toSvg } from 'html-to-image'

type UmlImageFormat = 'svg' | 'png'

interface ImageArea {
  width: number
  height: number
  /** Styles for the copy that's drawn (a transform that frames the elements, say). */
  style?: Partial<CSSStyleDeclaration>
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

/** `node` drawn as an image of `area`'s size, on the background it sits on. */
function elementImage(node: HTMLElement, format: UmlImageFormat, area: ImageArea): Promise<string> {
  const options = {
    width: Math.ceil(area.width),
    height: Math.ceil(area.height),
    backgroundColor: backgroundOf(node),
    pixelRatio: format === 'png' ? 2 : 1,
    filter: drawn,
    ...(area.style ? { style: area.style } : {}),
  }
  return format === 'png' ? toPng(node, options) : toSvg(node, options)
}

export { elementImage, type ImageArea, type UmlImageFormat }
