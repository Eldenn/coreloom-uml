import { type UmlLayout, type UmlSpec, umlElementIds } from './uml.ts'

/** The diagram without its layout. */
function withoutLayout(diagram: UmlSpec): UmlSpec {
  const { layout: _layout, ...rest } = diagram as UmlSpec & { layout?: UmlLayout }
  return rest as UmlSpec
}

/**
 * `after` with the positions `before` gave to the ids it still has (any layout in `after` is
 * ignored). `placed` counts the ids left without a position. Sequence diagrams have no layout.
 */
function keepLayout(
  before: UmlSpec | null,
  after: UmlSpec,
  relayout: boolean,
): { diagram: UmlSpec; placed: number } {
  if (after.kind === 'sequence') return { diagram: after, placed: 0 }
  const ids = umlElementIds(after)
  const old = !relayout && before && before.kind !== 'sequence' ? before.layout : undefined
  const kept: UmlLayout = {}
  for (const id of ids) if (old?.[id]) kept[id] = old[id]
  const count = Object.keys(kept).length
  const base = withoutLayout(after)
  return {
    diagram: count ? ({ ...base, layout: kept } as UmlSpec) : base,
    placed: ids.length - count,
  }
}

export { keepLayout, withoutLayout }
