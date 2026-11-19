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
