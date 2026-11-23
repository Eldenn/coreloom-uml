// Pure helpers of what an assistant message is about, kept free of the API client so they run in
// Node tests.

/** As the API's `ASSISTANT_CONTEXT_MAX`. */
export const ASSISTANT_CONTEXT_MAX = 8

/** Something the owner put in the context of the next messages, with the name its chip shows. */
export interface ContextItem extends AssistantPage {
  label: string
}

export function sameItem(a: AssistantPage, b: AssistantPage): boolean {
  return a.kind === b.kind && a.id === b.id
}

/**
 * The context with one more item: each once, `ASSISTANT_CONTEXT_MAX` at most (the same list comes
 * back when it is full). Without "Auto" the assistant reads one architecture and nothing else: an
 * architecture takes the place of the context, anything else is left out.
 */
export function addItem(
  items: readonly ContextItem[],
  item: ContextItem,
  autoOffered: boolean,
): readonly ContextItem[] {
  if (!autoOffered) return item.kind === 'architecture' ? [item] : items
  if (items.some((held) => sameItem(held, item)) || items.length >= ASSISTANT_CONTEXT_MAX)
    return items
  return [...items, item]
}

export type SubjectMode = 'auto' | 'architecture' | 'none'

/**
 * Where a message goes, from its context. One architecture and nothing else: straight to its
 * diagram assistant, and so does an empty context on an architecture's page (the owner is in its
 * editor: deciding would cost a call for the common case). Anything else is for "Auto", which
 * reads the items and decides; without it, the first architecture of the context, else nothing.
 */
export function subjectOf({
  items,
  pageArchitectureId,
  autoOffered,
}: {
  items: readonly AssistantPage[]
  pageArchitectureId: number | null
  autoOffered: boolean
}): { mode: 'architecture'; architectureId: number } | { mode: 'auto' | 'none' } {
  const first = items.find((item) => item.kind === 'architecture')
  if (first && items.length === 1) return { mode: 'architecture', architectureId: first.id }
  if (items.length === 0 && pageArchitectureId !== null)
    return { mode: 'architecture', architectureId: pageArchitectureId }
  if (autoOffered) return { mode: 'auto' }
  return first ? { mode: 'architecture', architectureId: first.id } : { mode: 'none' }
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
