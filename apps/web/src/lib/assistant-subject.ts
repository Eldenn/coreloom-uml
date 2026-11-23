// Pure helpers of what an assistant message is about, kept free of the API client so they run in
// Node tests.

/** As the API's `ASSISTANT_CONTEXT_MAX`. */
export const ASSISTANT_CONTEXT_MAX = 8

/** As the API's `POINTED_TYPES`: a part of a view the owner points at. */
export type PointedType = 'element' | 'relation' | 'member' | 'step'

/**
 * Something the owner put in the context of the next messages, with the name its chip shows: a
 * project, an architecture or agent conventions, one view of an architecture, or one part of a
 * view (`element`), known by the line that names it there.
 */
export type ContextItem =
  | (AssistantPage & { label: string })
  | { kind: 'view'; id: number; architectureId: number; label: string }
  | { kind: 'element'; viewId: number; architectureId: number; type: PointedType; label: string }

type ItemRef =
  | AssistantPage
  | { kind: 'view'; id: number }
  | { kind: 'element'; viewId: number; type: PointedType; label: string }

function itemKey(item: ItemRef): string {
  return item.kind === 'element'
    ? `element:${String(item.viewId)}:${item.type}:${item.label}`
    : `${item.kind}:${String(item.id)}`
}

export function sameItem(a: ItemRef, b: ItemRef): boolean {
  return itemKey(a) === itemKey(b)
}

/** The architecture an item is, or is a part of; null for a project or agent conventions. */
export function architectureOfItem(item: ContextItem): number | null {
  if (item.kind === 'architecture') return item.id
  return item.kind === 'view' || item.kind === 'element' ? item.architectureId : null
}

/** The one architecture every item is or is a part of; null when empty or mixed. */
function soleArchitecture(items: readonly ContextItem[]): number | null {
  const first = items[0] ? architectureOfItem(items[0]) : null
  return first !== null && items.every((item) => architectureOfItem(item) === first) ? first : null
}

/**
 * The context with one more item: each once, `ASSISTANT_CONTEXT_MAX` at most (the same list comes
 * back when it is full). Without "Auto" the assistant reads one architecture and nothing else: an
 * item of another architecture takes the place of the context, anything else is left out.
 */
export function addItem(
  items: readonly ContextItem[],
  item: ContextItem,
  autoOffered: boolean,
): readonly ContextItem[] {
  if (!autoOffered) {
    const architectureId = architectureOfItem(item)
    if (architectureId === null) return items
    if (item.kind === 'architecture' || soleArchitecture(items) !== architectureId) return [item]
  }
  if (items.some((held) => sameItem(held, item)) || items.length >= ASSISTANT_CONTEXT_MAX)
    return items
  return [...items, item]
}

/**
 * A view, or a part of one, as the diagram workspace names what a right-click landed on; on one
 * of several selected parts, all of them (`targets`).
 */
export type WorkspaceTarget =
  | { type: 'view'; viewId: string; label: string }
  | { type: PointedType; viewId: string; label: string }
  | {
      type: 'selection'
      viewId: string
      targets: readonly { type: PointedType; label: string }[]
    }

/** The context items a target of the workspace stands for, each once. */
export function workspaceItems(
  target: WorkspaceTarget,
  viewId: number,
  architectureId: number,
): ContextItem[] {
  if (target.type === 'view')
    return [{ kind: 'view', id: viewId, architectureId, label: target.label }]
  const parts = target.type === 'selection' ? target.targets : [target]
  const items: ContextItem[] = []
  for (const { type, label } of parts) {
    const item: ContextItem = { kind: 'element', viewId, architectureId, type, label }
    if (!items.some((other) => sameItem(other, item))) items.push(item)
  }
  return items
}

export type SubjectMode = 'auto' | 'architecture' | 'none'

type Route =
  | {
      mode: 'architecture'
      architectureId: number
      /** The views the context names; absent when it names the whole architecture, or none. */
      diagramIds?: number[]
    }
  | { mode: 'auto' | 'none' }

/** The views the items name, each once; absent when one of them is the architecture itself. */
function namedViews(items: readonly ContextItem[]): { diagramIds?: number[] } {
  if (items.some((item) => item.kind === 'architecture')) return {}
  const ids = items.flatMap((item) => {
    if (item.kind === 'view') return [item.id]
    return item.kind === 'element' ? [item.viewId] : []
  })
  return ids.length > 0 ? { diagramIds: [...new Set(ids)] } : {}
}

/**
 * Where a message goes, from its context. Items of one architecture and nothing else (itself, its
 * views, parts of them): straight to its diagram assistant, and so does an empty context on an
 * architecture's page (the owner is in its editor: deciding would cost a call for the common
 * case). Anything else is for "Auto", which reads the items and decides; without it, the first
 * architecture the context names, else nothing.
 */
export function subjectOf({
  items,
  pageArchitectureId,
  autoOffered,
}: {
  items: readonly ContextItem[]
  pageArchitectureId: number | null
  autoOffered: boolean
}): Route {
  const sole = soleArchitecture(items)
  if (sole !== null) return { mode: 'architecture', architectureId: sole, ...namedViews(items) }
  if (items.length === 0 && pageArchitectureId !== null)
    return { mode: 'architecture', architectureId: pageArchitectureId }
  if (autoOffered) return { mode: 'auto' }
  const first = items.map(architectureOfItem).find((id) => id !== null)
  if (first == null) return { mode: 'none' }
  return {
    mode: 'architecture',
    architectureId: first,
    ...namedViews(items.filter((item) => architectureOfItem(item) === first)),
  }
}

/** As the API's `pointed` input. */
export interface PointedPart {
  diagramId: number
  type: PointedType
  label: string
}

/**
 * The context as the API takes it: the items "Auto" reads (the view of a pointed part goes with
 * it, so its architecture is known) and the parts pointed at.
 */
export function sentContext(items: readonly ContextItem[]): {
  context: { kind: AssistantPage['kind'] | 'view'; id: number }[]
  pointed: PointedPart[]
} {
  const context = new Map<string, { kind: AssistantPage['kind'] | 'view'; id: number }>()
  const pointed: PointedPart[] = []
  for (const item of items) {
    if (item.kind === 'element')
      pointed.push({ diagramId: item.viewId, type: item.type, label: item.label })
    const ref =
      item.kind === 'element'
        ? ({ kind: 'view', id: item.viewId } as const)
        : { kind: item.kind, id: item.id }
    context.set(itemKey(ref), ref)
  }
  return { context: [...context.values()], pointed }
}

/** As the API's `page` input: what "here" means in a message the assistant routes by itself. */
export interface AssistantPage {
  kind: 'project' | 'architecture' | 'agent-config'
  id: number
}

/** The page the panel is on, when it is one of an architecture, agent conventions or a project. */
export function pageOf({
  architectureId,
  configId,
  projectId,
}: {
  architectureId?: number | null
  configId?: number | null
  projectId?: number | null
}): AssistantPage | undefined {
  if (architectureId != null) return { kind: 'architecture', id: architectureId }
  if (configId != null) return { kind: 'agent-config', id: configId }
  if (projectId != null) return { kind: 'project', id: projectId }
  return undefined
}
