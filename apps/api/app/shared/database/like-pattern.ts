/** Escapes LIKE wildcards so a search for `50%` matches the text `50%`. */
export function likePattern(search: string) {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}
