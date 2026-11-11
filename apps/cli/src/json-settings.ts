/**
 * A JSON settings file (`.claude/settings.json`…) cannot hold markers, so instead of a managed
 * block the CLI owns entries: the generation's content is a JSON object that is merged into the
 * file (objects key by key, arrays as sets, any other value replaced), and the manifest keeps
 * that object as last written. The next pull first takes out what the manifest lists, then merges
 * the new object in, so an entry that left the generation leaves the file and everything else in
 * the file is kept. An entry the manifest lists and the file no longer holds was removed or
 * changed by hand. Comments and key order inside the file are not kept: it is rewritten as plain
 * JSON, two spaces.
 */
export type Json = null | boolean | number | string | Json[] | JsonObject
export type JsonObject = { [key: string]: Json }

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Deep equality, key order included: enough for entries this CLI wrote itself. */
export const sameJson = (a: Json | undefined, b: Json | undefined) =>
  JSON.stringify(a) === JSON.stringify(b)

/** The JSON object a text holds (`{}` for an empty file), or `null` when it holds none. */
export function parseJsonObject(text: string): JsonObject | null {
  if (text.trim() === '') return {}
  try {
    const value = JSON.parse(text) as Json
    return isObject(value) ? value : null
  } catch {
    return null
  }
}

export function formatJson(value: Json): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/** Whether `local` still holds everything in `managed`. */
export function containsJson(local: Json | undefined, managed: Json): boolean {
  if (isObject(managed)) {
    return (
      isObject(local) &&
      Object.entries(managed).every(
        ([key, value]) => Object.hasOwn(local, key) && containsJson(local[key], value),
      )
    )
  }
  if (Array.isArray(managed)) {
    return (
      Array.isArray(local) && managed.every((entry) => local.some((item) => sameJson(item, entry)))
    )
  }
  return sameJson(local, managed)
}

/** `local` without what `managed` put there; `undefined` when nothing is left. */
export function withoutJson(local: Json, managed: Json): Json | undefined {
  if (isObject(managed) && isObject(local)) {
    const rest = new Map(Object.entries(local))
    for (const [key, value] of Object.entries(managed)) {
      const kept = rest.get(key)
      if (kept === undefined) continue
      const left = withoutJson(kept, value)
      if (left === undefined) rest.delete(key)
      else rest.set(key, left)
    }
    return rest.size > 0 ? Object.fromEntries(rest) : undefined
  }
  if (Array.isArray(managed) && Array.isArray(local)) {
    const rest = local.filter((item) => !managed.some((entry) => sameJson(item, entry)))
    return rest.length > 0 ? rest : undefined
  }
  return sameJson(local, managed) ? undefined : local
}

/** `local` with `managed` merged in. `Object.fromEntries` keeps a `__proto__` key a plain key. */
export function mergeJson(local: Json | undefined, managed: Json): Json {
  if (isObject(managed)) {
    const merged = new Map(Object.entries(isObject(local) ? local : {}))
    for (const [key, value] of Object.entries(managed)) {
      merged.set(key, mergeJson(merged.get(key), value))
    }
    return Object.fromEntries(merged)
  }
  if (Array.isArray(managed)) {
    const base = Array.isArray(local) ? local : []
    return [...base, ...managed.filter((entry) => !base.some((item) => sameJson(item, entry)))]
  }
  return managed
}
