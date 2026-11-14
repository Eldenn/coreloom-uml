import { readFileSync } from 'node:fs'

import type { CodeMap } from './code-map.ts'
import { importGraphify } from './graphify.ts'

/** A graphify `graph.json` from `fixtures/`, parsed. Tests only. */
export function readGraph(name: 'adonis' | 'frameworks'): unknown {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/${name}-graph.json`, import.meta.url), 'utf8'),
  )
}

/** The fixture imported into a code map. Tests only. */
export function fixtureMap(name: 'adonis' | 'frameworks'): CodeMap {
  const result = importGraphify(readGraph(name))
  if (!result.ok) throw new Error(result.problems.join('\n'))
  return result.map
}
