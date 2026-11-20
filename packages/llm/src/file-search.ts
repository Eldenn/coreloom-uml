import { splitText } from './file-digest.ts'

/*
 * Finding the passages of the conversation's files a request is about, by its words: no
 * embedding, no index kept, the texts are scanned in memory. Passages are cut as the summaries'
 * parts are (at a line break when one is near), and ranked by the words they hold, a word found
 * in fewer passages weighing more, so common words count for little in any language.
 */

/** One passage: what a search answers and the assistant reads. */
export const FILE_PASSAGE_LENGTH = 1500
/** Words shorter than this are not searched: articles and the like. */
const WORD_MIN_LENGTH = 3
/** Most words of a query searched. */
const QUERY_WORDS_MAX = 24

export type SearchedText = { id: number; text: string }
/** Offsets in characters of the file's text: `text.slice(start, end)` is the passage. */
export type Passage = { id: number; start: number; end: number; score: number }

/** Lower case, accents dropped: "Été" and "ete" match. */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** The distinct words of a query, as they are searched. */
export function queryWords(query: string): string[] {
  const words = fold(query).match(/[\p{L}\p{N}_]+/gu) ?? []
  return [...new Set(words.filter((word) => word.length >= WORD_MIN_LENGTH))].slice(
    0,
    QUERY_WORDS_MAX,
  )
}

/**
 * The passages of `texts` holding the words of `query`, best first (ties in reading order), at
 * most `limit`. A passage with none of the words is never answered.
 */
export function findPassages(
  texts: readonly SearchedText[],
  query: string,
  options: { limit: number; length?: number },
): Passage[] {
  const words = queryWords(query)
  if (words.length === 0) return []
  const windows: { id: number; start: number; end: number; found: string[] }[] = []
  for (const { id, text } of texts) {
    let start = 0
    for (const part of splitText(text, options.length ?? FILE_PASSAGE_LENGTH)) {
      const folded = fold(part)
      const found = words.filter((word) => folded.includes(word))
      if (found.length > 0) windows.push({ id, start, end: start + part.length, found })
      start += part.length
    }
  }
  const total = texts.reduce(
    (sum, { text }) => sum + Math.ceil(text.length / (options.length ?? FILE_PASSAGE_LENGTH)),
    0,
  )
  const holding = new Map<string, number>()
  for (const window of windows)
    for (const word of window.found) holding.set(word, (holding.get(word) ?? 0) + 1)
  // A word in every passage still weighs a little: a query of common words finds something.
  const weight = (word: string) => Math.log(1 + total / (holding.get(word) ?? 1))
  return windows
    .map(({ id, start, end, found }) => ({
      id,
      start,
      end,
      score: found.reduce((sum, word) => sum + weight(word), 0),
    }))
    .sort((a, b) => b.score - a.score || a.id - b.id || a.start - b.start)
    .slice(0, options.limit)
}
