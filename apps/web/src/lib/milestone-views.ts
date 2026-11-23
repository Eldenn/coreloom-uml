// Pure helper of the milestones' comparison, kept free of the API client so it runs in Node tests.

/** A view on one side of a comparison: `id` is the diagram it is (or was). */
export interface ComparedView {
  id: number
  title: string
}

/**
 * The views of two states of an architecture, paired by diagram: those of `after` in its order,
 * then the ones only `before` holds. A side is missing when the view was added or removed.
 */
export function pairViews<V extends ComparedView>(
  before: readonly V[],
  after: readonly V[],
): { before?: V; after?: V }[] {
  const older = new Map(before.map((view) => [view.id, view]))
  const pairs: { before?: V; after?: V }[] = after.map((view) => {
    const was = older.get(view.id)
    older.delete(view.id)
    return was ? { before: was, after: view } : { after: view }
  })
  for (const removed of older.values()) pairs.push({ before: removed })
  return pairs
}
