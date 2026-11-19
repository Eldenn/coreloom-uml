// Pure helpers of what an assistant message is about, kept free of the API client so they run in
// Node tests.

/** Whether a message names a web page: an `http(s)://` address with something after it. */
export function containsWebAddress(text: string): boolean {
  return /(^|[^a-z])https?:\/\/[^\s/]/i.test(text)
}

/**
 * The agent conventions "From the web" targets before the owner picks any: the page's, else the
 * ones of the project (the page's, or the architecture's); `null` when the owner has to choose.
 */
export function defaultConventions({
  pageConfigId,
  projectId,
  configs,
}: {
  pageConfigId: number | null
  projectId: number | null
  configs: readonly { id: number; projectId: number | null }[]
}): number | null {
  if (pageConfigId !== null) return pageConfigId
  if (projectId === null) return null
  return configs.find((config) => config.projectId === projectId)?.id ?? null
}

export type SubjectMode = 'auto' | 'architecture' | 'web' | 'none'

/**
 * What a message is about: the owner's choice while it is still offered, else the start. That is
 * the architecture whose page this is (the owner is in its editor: deciding would cost a call for
 * the common case), else "Auto" (the assistant decides) when it is offered, else nothing.
 */
export function subjectMode({
  wanted,
  autoOffered,
  webOffered,
  onArchitecture,
}: {
  /** `null` until the owner chooses. */
  wanted: SubjectMode | null
  autoOffered: boolean
  webOffered: boolean
  onArchitecture: boolean
}): SubjectMode {
  const offered =
    wanted !== null && !(wanted === 'auto' && !autoOffered) && !(wanted === 'web' && !webOffered)
  if (offered) return wanted
  if (onArchitecture) return 'architecture'
  return autoOffered ? 'auto' : 'none'
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
