// What the Skills screen reads from its URL, and the labels of the API's values.
import type { SkillsQuery, SkillsSort } from '@/lib/skills'
import type { Messages } from '@/messages'

/** The values of `labels` found in a comma-separated URL parameter, unknown ones dropped. */
export function pickValues<K extends string>(labels: Record<K, string>, raw?: string): K[] {
  if (!raw) return []
  return raw.split(',').filter((value): value is K => Object.hasOwn(labels, value))
}

/** A label from `labels`, or the value itself when the app does not know it yet. */
export function labelOf(labels: Record<string, string>, value: string) {
  return Object.hasOwn(labels, value) ? labels[value] : value
}

export function topicLabel(t: Messages['skills'], topic: string) {
  return labelOf(t.topics, topic)
}

/** Skills per page; the API's own page size is set to match. */
export const SKILLS_PAGE_SIZE = 20

type Query = NonNullable<SkillsQuery>
type ValuesOf<K extends keyof Query> = Extract<NonNullable<Query[K]>, readonly unknown[]>[number]

/** The labels of every value a filter takes: the values the URL may carry. */
interface SkillsLabels {
  topics: Record<ValuesOf<'topic'>, string>
  kinds: Record<ValuesOf<'diagramKind'>, string>
  states: Record<ValuesOf<'state'>, string>
  risks: Record<ValuesOf<'risk'>, string>
  sorts: Record<SkillsSort, string>
}

/** What the API is asked for, from the URL's parameters. */
export function skillsQueryFrom(
  params: URLSearchParams,
  labels: SkillsLabels,
): NonNullable<SkillsQuery> & { sort: SkillsSort } {
  const sort = pickValues(labels.sorts, params.get('sort') ?? undefined).at(0)
  const search = params.get('q')?.trim()
  return {
    ...(search ? { search } : {}),
    topic: pickValues(labels.topics, params.get('topic') ?? undefined),
    diagramKind: pickValues(labels.kinds, params.get('diagramKind') ?? undefined),
    state: pickValues(labels.states, params.get('state') ?? undefined),
    risk: pickValues(labels.risks, params.get('risk') ?? undefined),
    sort: sort ?? 'installs',
    page: Math.max(1, Number(params.get('page')) || 1),
    perPage: SKILLS_PAGE_SIZE,
  }
}
