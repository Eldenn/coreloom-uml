import type { Target } from '../targets.ts'

/** Advice the renderer cannot write as a file (a setting, a choice to make by hand). */
export type Recommendation = {
  target: Target
  title: string
  /** Markdown, rendered without raw HTML. */
  body: string
}

/** What a target's recommendations may depend on. */
export type RecommendationContext = {
  /** The answer to the `tooling.checks` slot, if any: the commands run before handing back. */
  checks: string | null
}

/**
 * How Coreloom UML renders files for one coding tool. `verifiedOn` is the date its
 * documentation (`sources`) was last read to confirm what it loads; re-read it and update the
 * date whenever the tool's behaviour may have changed.
 */
export type TargetTemplate = {
  target: Target
  name: string
  verifiedOn: string
  sources: readonly string[]
  /** Whether the tool loads the repository's root AGENTS.md without any pointer. */
  readsAgentsMd: boolean
  /** The pointer file for a tool that does not read AGENTS.md: its path and its block body. */
  pointer?: { path: string; body: string }
  recommendations: (context: RecommendationContext) => Omit<Recommendation, 'target'>[]
}

/**
 * The pointer for a tool that can neither read AGENTS.md nor import a file. Never a copy of the
 * sections: AGENTS.md holds all the content.
 */
export const TEXT_POINTER = 'Read and follow AGENTS.md at the repository root.'
